// Chroma向量库实战演示 - 2.4文章配套代码
// 包含：文档索引、向量检索、RAG问答完整流程

// ==================== 1. Chroma客户端封装 ====================
class ChromaClient {
  constructor(baseUrl, collectionName = 'documents') {
    this.baseUrl = baseUrl;
    this.collectionName = collectionName;
    this.apiBase = `${baseUrl}/api/v1`;
  }

  // 测试连接
  async testConnection() {
    try {
      const response = await fetch(`${this.apiBase}/heartbeat`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // 创建或获取集合
  async getOrCreateCollection() {
    try {
      const response = await fetch(`${this.apiBase}/collections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: this.collectionName,
          metadata: { 
            description: 'Demo document collection',
            created_at: new Date().toISOString()
          }
        })
      });
      
      if (!response.ok) {
        // 如果集合已存在，尝试获取
        if (response.status === 409) {
          return await this.getCollection();
        }
        throw new Error(`创建集合失败: ${response.statusText}`);
      }
      
      return { success: true, data: await response.json() };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // 获取集合信息
  async getCollection() {
    try {
      const response = await fetch(`${this.apiBase}/collections/${this.collectionName}`);
      if (!response.ok) {
        throw new Error(`获取集合失败: ${response.statusText}`);
      }
      const data = await response.json();
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // 添加文档和向量
  async addDocuments(documents, embeddings, ids, metadatas = []) {
    try {
      const response = await fetch(
        `${this.apiBase}/collections/${this.collectionName}/add`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ids: ids,
            embeddings: embeddings,
            documents: documents,
            metadatas: metadatas.length ? metadatas : documents.map(() => ({}))
          })
        }
      );
      
      if (!response.ok) {
        throw new Error(`添加文档失败: ${response.statusText}`);
      }
      
      return { success: true, data: await response.json() };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // 向量相似度搜索
  async query(embedding, nResults = 5) {
    try {
      const response = await fetch(
        `${this.apiBase}/collections/${this.collectionName}/query`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query_embeddings: [embedding],
            n_results: nResults,
            include: ['documents', 'metadatas', 'distances']
          })
        }
      );
      
      if (!response.ok) {
        throw new Error(`查询失败: ${response.statusText}`);
      }
      
      const result = await response.json();
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // 获取所有文档
  async getAllDocuments(limit = 100) {
    try {
      const response = await fetch(
        `${this.apiBase}/collections/${this.collectionName}/get`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            limit: limit,
            include: ['documents', 'metadatas']
          })
        }
      );
      
      if (!response.ok) {
        throw new Error(`获取文档失败: ${response.statusText}`);
      }
      
      const result = await response.json();
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // 删除文档
  async deleteDocuments(ids) {
    try {
      const response = await fetch(
        `${this.apiBase}/collections/${this.collectionName}/delete`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: ids })
        }
      );
      
      if (!response.ok) {
        throw new Error(`删除失败: ${response.statusText}`);
      }
      
      return { success: true, data: await response.json() };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

// ==================== 2. Embedding生成（模拟）====================
// 注意：实际项目中应该使用真实的embedding模型
// 这里为了演示，使用简单的哈希算法模拟向量生成

function generateMockEmbedding(text) {
  // 这是一个简化的模拟实现
  // 实际生产环境应该使用 @xenova/transformers 或其他embedding服务
  
  const dimensions = 384; // all-MiniLM-L6-v2的维度
  const embedding = new Array(dimensions).fill(0);
  
  // 基于文本内容生成伪随机向量
  for (let i = 0; i < text.length && i < dimensions; i++) {
    embedding[i] = (text.charCodeAt(i) / 255) * 2 - 1; // 归一化到[-1, 1]
  }
  
  // 添加一些随机性使不同文本有不同向量
  const seed = text.length;
  for (let i = 0; i < dimensions; i++) {
    embedding[i] += (Math.sin(seed * (i + 1)) * 0.1);
  }
  
  // 归一化向量（L2归一化）
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  if (magnitude > 0) {
    for (let i = 0; i < dimensions; i++) {
      embedding[i] /= magnitude;
    }
  }
  
  return embedding;
}

// ==================== 3. UI交互函数 ====================
let chroma = null;
let indexedDocs = [];

function showStatus(elementId, message, type) {
  const el = document.getElementById(elementId);
  el.textContent = message;
  el.className = `status-box ${type}`;
  
  // 3秒后自动隐藏
  setTimeout(() => {
    el.className = 'status-box';
  }, 3000);
}

function showOutput(text) {
  document.getElementById('outputArea').textContent = text;
}

function getChromaClient() {
  const baseUrl = document.getElementById('chromaUrl').value.trim();
  const collectionName = document.getElementById('collectionName').value.trim();
  
  if (!chroma || chroma.baseUrl !== baseUrl || chroma.collectionName !== collectionName) {
    chroma = new ChromaClient(baseUrl, collectionName);
  }
  
  return chroma;
}

// 测试连接
async function testConnection() {
  const client = getChromaClient();
  showStatus('connectionStatus', '正在测试连接...', 'info');
  
  const result = await client.testConnection();
  
  if (result.success) {
    showStatus('connectionStatus', `✅ 连接成功！服务器时间: ${result.data['nanosecond heartbeat']}`, 'success');
  } else {
    showStatus('connectionStatus', `❌ 连接失败: ${result.error}\n\n请检查：\n1. Chroma服务是否启动\n2. 地址是否正确\n3. 是否有CORS跨域问题`, 'error');
  }
}

// 创建集合
async function createCollection() {
  const client = getChromaClient();
  showStatus('connectionStatus', '正在创建集合...', 'info');
  
  const result = await client.getOrCreateCollection();
  
  if (result.success) {
    showStatus('connectionStatus', `✅ 集合创建成功！`, 'success');
    loadDocumentList();
  } else {
    showStatus('connectionStatus', `❌ 创建失败: ${result.error}`, 'error');
  }
}

// 索引文档
async function indexDocument() {
  const docId = document.getElementById('docId').value.trim();
  const content = document.getElementById('docContent').value.trim();
  
  if (!docId || !content) {
    showStatus('indexStatus', '❌ 请填写文档ID和内容', 'error');
    return;
  }
  
  const client = getChromaClient();
  showStatus('indexStatus', '正在生成向量并索引...', 'info');
  
  try {
    // 确保集合存在
    await client.getOrCreateCollection();
    
    // 生成向量（实际项目中应该调用真实的embedding API）
    const embedding = generateMockEmbedding(content);
    
    // 添加到Chroma
    const result = await client.addDocuments(
      [content],
      [embedding],
      [docId],
      [{ 
        source: 'manual-input', 
        timestamp: Date.now(),
        content_length: content.length
      }]
    );
    
    if (result.success) {
      showStatus('indexStatus', `✅ 文档索引成功！ID: ${docId}`, 'success');
      
      // 更新本地文档列表
      indexedDocs.push({ id: docId, content, timestamp: Date.now() });
      updateDocumentList();
      
      // 自动生成下一个ID
      const nextNum = parseInt(docId.split('-')[1]) + 1;
      document.getElementById('docId').value = `doc-${nextNum}`;
    } else {
      showStatus('indexStatus', `❌ 索引失败: ${result.error}`, 'error');
    }
  } catch (error) {
    showStatus('indexStatus', `❌ 错误: ${error.message}`, 'error');
  }
}

// 加载示例文档
function loadExample() {
  const examples = [
    {
      id: 'react-perf',
      content: 'React性能优化的核心方法包括：使用React.memo避免不必要的重渲染，使用useMemo缓存计算结果，使用useCallback缓存函数引用，以及合理使用虚拟列表减少DOM节点数量。'
    },
    {
      id: 'vue-reactivity',
      content: 'Vue 3的响应式系统基于Proxy实现，相比Vue 2的Object.defineProperty，可以检测到属性的添加和删除，性能更好，支持Map、Set等数据结构。'
    },
    {
      id: 'css-grid',
      content: 'CSS Grid布局是二维布局系统，可以同时处理行和列。使用grid-template-columns和grid-template-rows定义网格，通过grid-area放置元素，比Flexbox更适合复杂页面布局。'
    }
  ];
  
  const randomExample = examples[Math.floor(Math.random() * examples.length)];
  document.getElementById('docId').value = randomExample.id;
  document.getElementById('docContent').value = randomExample.content;
  
  showStatus('indexStatus', '✅ 已加载示例文档', 'success');
}

// 更新文档列表显示
function updateDocumentList() {
  const listEl = document.getElementById('documentList');
  
  if (indexedDocs.length === 0) {
    listEl.innerHTML = '<p style="color: #9ca3af; font-size: 13px;">暂无文档，请先索引文档</p>';
    return;
  }
  
  listEl.innerHTML = indexedDocs.map(doc => `
    <div class="doc-item" onclick="selectDoc('${doc.id}')">
      <div class="doc-title">${doc.id}</div>
      <div class="doc-preview">${doc.content.substring(0, 60)}...</div>
    </div>
  `).join('');
}

// 选择文档
function selectDoc(docId) {
  const doc = indexedDocs.find(d => d.id === docId);
  if (doc) {
    document.getElementById('docId').value = doc.id;
    document.getElementById('docContent').value = doc.content;
    
    // 高亮选中
    document.querySelectorAll('.doc-item').forEach(el => {
      el.classList.remove('selected');
    });
    event.target.closest('.doc-item').classList.add('selected');
  }
}

// 加载文档列表
async function loadDocumentList() {
  const client = getChromaClient();
  const result = await client.getAllDocuments(100);
  
  if (result.success && result.data.ids && result.data.ids.length > 0) {
    indexedDocs = result.data.ids.map((id, index) => ({
      id,
      content: result.data.documents[index],
      metadata: result.data.metadatas[index]
    }));
    updateDocumentList();
  }
}

// 搜索相似文档
async function searchDocuments() {
  const queryText = document.getElementById('queryText').value.trim();
  const nResults = parseInt(document.getElementById('nResults').value);
  
  if (!queryText) {
    showStatus('searchStatus', '❌ 请输入查询问题', 'error');
    return;
  }
  
  const client = getChromaClient();
  showStatus('searchStatus', '正在向量化并搜索...', 'info');
  
  try {
    // 生成查询向量
    const queryEmbedding = generateMockEmbedding(queryText);
    
    // 执行向量检索
    const result = await client.query(queryEmbedding, nResults);
    
    if (result.success) {
      const data = result.data;
      
      if (!data.documents[0] || data.documents[0].length === 0) {
        showStatus('searchStatus', '⚠️ 未找到相关文档', 'info');
        showOutput('// 未找到匹配的文档\n// 请先索引一些文档再试');
        return;
      }
      
      // 格式化输出结果
      let output = `🔍 查询: "${queryText}"\n`;
      output += `📊 返回结果数: ${data.documents[0].length}\n\n`;
      
      data.documents[0].forEach((doc, index) => {
        const distance = data.distances[0][index];
        const similarity = (1 - distance).toFixed(4); // 转换为相似度
        
        // 根据距离判断相关性
        let badge = '';
        if (distance < 0.3) {
          badge = '<span class="similarity-badge similarity-high">非常相关</span>';
        } else if (distance < 0.5) {
          badge = '<span class="similarity-badge similarity-medium">比较相关</span>';
        } else {
          badge = '<span class="similarity-badge similarity-low">相关性弱</span>';
        }
        
        output += `--- 结果 ${index + 1} ${badge} ---\n`;
        output += `距离值: ${distance.toFixed(4)} (越小越相似)\n`;
        output += `相似度: ${similarity}\n`;
        output += `文档ID: ${data.ids[0][index]}\n`;
        output += `内容:\n${doc}\n\n`;
      });
      
      output += `\n💡 提示：\n`;
      output += `- 距离值 < 0.3：非常相关\n`;
      output += `- 距离值 0.3-0.5：比较相关\n`;
      output += `- 距离值 > 0.5：相关性较弱\n`;
      
      showOutput(output);
      showStatus('searchStatus', `✅ 找到 ${data.documents[0].length} 条相关文档`, 'success');
    } else {
      showStatus('searchStatus', `❌ 搜索失败: ${result.error}`, 'error');
    }
  } catch (error) {
    showStatus('searchStatus', `❌ 错误: ${error.message}`, 'error');
  }
}

// AI问答（RAG）
async function askQuestion() {
  const queryText = document.getElementById('queryText').value.trim();
  const apiKey = document.getElementById('apiKey').value.trim();
  
  if (!queryText) {
    showStatus('searchStatus', '❌ 请输入问题', 'error');
    return;
  }
  
  const client = getChromaClient();
  showStatus('searchStatus', '正在检索相关知识...', 'info');
  
  try {
    // 1. 向量检索
    const queryEmbedding = generateMockEmbedding(queryText);
    const searchResult = await client.query(queryEmbedding, 3);
    
    if (!searchResult.success || !searchResult.data.documents[0]?.length) {
      showOutput('// 未找到相关知识库内容\n// 请先索引相关文档');
      showStatus('searchStatus', '⚠️ 未找到相关知识', 'info');
      return;
    }
    
    // 2. 构造上下文
    const context = searchResult.data.documents[0].join('\n\n');
    const distances = searchResult.data.distances[0];
    
    let output = `📚 检索到的相关知识：\n\n`;
    searchResult.data.documents[0].forEach((doc, idx) => {
      output += `[${idx + 1}] 距离值: ${distances[idx].toFixed(4)}\n${doc}\n\n`;
    });
    
    output += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    output += `❓ 问题: ${queryText}\n\n`;
    
    // 3. 如果有API Key，调用LLM
    if (apiKey) {
      output += `🤖 正在调用AI生成回答...\n\n`;
      showOutput(output);
      
      try {
        const prompt = `基于以下文档内容回答问题：

${context}

问题：${queryText}

请给出简洁准确的回答：`;

        const response = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: 'qwen-turbo',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3,
            max_tokens: 512
          })
        });
        
        const data = await response.json();
        const answer = data.choices[0].message.content;
        
        output += `💡 AI回答：\n${answer}\n\n`;
        output += `---\n来源文档距离值：${distances.map(d => d.toFixed(4)).join(', ')}\n`;
        output += `(数值越小代表相似度越高，通常小于0.5表示相关)`;
        
        showOutput(output);
        showStatus('searchStatus', '✅ RAG问答完成', 'success');
      } catch (error) {
        output += `❌ AI调用失败: ${error.message}\n\n`;
        output += `不过你已经拿到了相关知识片段，可以手动回答问题了。`;
        showOutput(output);
        showStatus('searchStatus', '⚠️ 检索成功但AI调用失败', 'info');
      }
    } else {
      output += `💡 提示：配置API Key后可获得AI生成的完整回答。\n\n`;
      output += `当前已检索到相关知识，你可以：\n`;
      output += `1. 输入API Key后点击"AI问答"\n`;
      output += `2. 或者根据上面的知识片段手动回答`;
      
      showOutput(output);
      showStatus('searchStatus', '✅ 检索完成（未配置AI）', 'info');
    }
  } catch (error) {
    showStatus('searchStatus', `❌ 错误: ${error.message}`, 'error');
  }
}

// 清空结果
function clearResults() {
  showOutput('// 检索结果将显示在这里...\n// 包含相似度分数和相关文档片段');
  showStatus('searchStatus', '', '');
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  // 自动测试连接
  setTimeout(() => {
    testConnection();
  }, 500);
});

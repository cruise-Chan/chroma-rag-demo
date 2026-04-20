# Chroma向量库实战演示 - 2.4文章配套代码

完整的Chroma向量数据库前端集成示例，包含文档索引、向量检索、RAG问答功能。

## 📁 项目结构

```
chroma-rag-demo/
├── index.html              # 前端界面
├── app.js                  # 前端逻辑（Chroma客户端封装）
├── embedding-server.py     # Python后端示例（真实Embedding生成）
└── README.md               # 说明文档
```

## 🚀 快速开始

### 方式一：纯前端演示（模拟向量）

直接用浏览器打开 `index.html` 即可运行。

**注意**：此模式使用简化的哈希算法模拟向量生成，仅用于演示UI交互流程。

```bash
# Windows
start index.html

# macOS
open index.html
```

### 方式二：完整RAG演示（真实向量）

需要启动Chroma服务和Python后端。

#### 1. 安装依赖

```bash
# 安装ChromaDB
pip install chromadb

# 安装后端依赖
pip install fastapi uvicorn sentence-transformers
```

#### 2. 启动Chroma服务

```bash
# 启动Chroma HTTP服务（端口8000）
chroma run --path ./chroma_data --host 0.0.0.0 --port 8000
```

**跨域配置**（如果前端直接请求Chroma）：

```bash
# macOS/Linux
export CHROMA_CORS_ALLOW_ORIGINS='["http://localhost:5173","http://localhost:3000"]'
chroma run --path ./chroma_data

# Windows PowerShell
$env:CHROMA_CORS_ALLOW_ORIGINS='["http://localhost:5173","http://localhost:3000"]'
chroma run --path ./chroma_data
```

#### 3. 启动Embedding后端（可选但推荐）

```bash
python embedding-server.py
```

服务将在 `http://localhost:8001` 启动。

#### 4. 打开前端页面

```bash
start index.html  # Windows
open index.html   # macOS
```

## 📖 功能说明

### 1. Chroma配置

- **服务器地址**：默认 `http://localhost:8000`
- **集合名称**：用于隔离不同项目的数据
- **测试连接**：验证Chroma服务是否正常运行

### 2. 文档索引

将文本内容转换为向量并存入Chroma数据库。

**操作流程**：
1. 输入文档ID（唯一标识符）
2. 粘贴文档内容
3. 点击"索引文档"
4. 系统自动生成向量并存储

**示例文档**：
```
React性能优化的核心方法包括：使用React.memo避免不必要的重渲染，
使用useMemo缓存计算结果，使用useCallback缓存函数引用，以及合理
使用虚拟列表减少DOM节点数量。
```

### 3. 向量检索

通过自然语言问题搜索相似文档。

**关键概念**：
- **距离值（distance）**：数值越小代表相似度越高
  - `< 0.3`：非常相关
  - `0.3-0.5`：比较相关
  - `> 0.5`：相关性较弱
- **相似度（similarity）**：`1 - distance`，越大越相似

### 4. RAG问答

结合检索到的知识和AI生成完整回答。

**工作流程**：
```
用户提问 → 问题向量化 → 检索相关文档 → 构造Prompt → AI生成回答
```

## 🔧 核心代码解析

### Chroma客户端封装

```javascript
class ChromaClient {
  constructor(baseUrl, collectionName) {
    this.apiBase = `${baseUrl}/api/v1`;
    this.collectionName = collectionName;
  }

  // 向量相似度搜索
  async query(embedding, nResults = 5) {
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
    return await response.json();
  }
}
```

### Embedding生成（后端示例）

```python
from sentence_transformers import SentenceTransformer

# 加载模型（首次会下载，约20MB）
model = SentenceTransformer('all-MiniLM-L6-v2')

# 生成向量
texts = ["你好世界", "这是测试"]
embeddings = model.encode(texts).tolist()

# 输出：384维向量数组
print(len(embeddings[0]))  # 384
```

### 距离值解读

```javascript
// Chroma返回的距离值
const distances = [0.23, 0.45, 0.67];

distances.forEach((distance, index) => {
  const similarity = (1 - distance).toFixed(4);
  
  if (distance < 0.3) {
    console.log(`结果${index + 1}：非常相关 (${similarity})`);
  } else if (distance < 0.5) {
    console.log(`结果${index + 1}：比较相关 (${similarity})`);
  } else {
    console.log(`结果${index + 1}：相关性弱 (${similarity})`);
  }
});
```

## ⚠️ 常见问题

### Q1: 前端请求Chroma报CORS错误？

**解决方案1**：启动时配置环境变量
```bash
export CHROMA_CORS_ALLOW_ORIGINS='["http://localhost:5173"]'
chroma run --path ./chroma_data
```

**解决方案2**：使用Vite代理
```javascript
// vite.config.js
export default {
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true
      }
    }
  }
}
```

### Q2: 浏览器端跑模型太慢？

**老手提醒**：
- 模型文件20+MB，首次加载很慢
- 向量化计算阻塞UI主线程
- 移动端可能卡死

**推荐方案**：把Embedding放到后端处理
```
前端 → Node.js/Python中间层 → ChromaDB
     （生成向量）
```

### Q3: 距离值很大（>1）怎么办？

可能原因：
1. 向量未归一化
2. 使用了不同的embedding模型
3. 维度不匹配

**检查方法**：
```javascript
// 确保向量已L2归一化
const magnitude = Math.sqrt(vec.reduce((s, v) => s + v*v, 0));
const normalized = vec.map(v => v / magnitude);
```

## 📊 性能优化建议

1. **批量插入**：攒够10条再一次性提交
2. **定期清理**：删除过期集合释放空间
3. **索引策略**：长文档先切片再索引
4. **缓存向量**：避免重复生成

## 🔗 相关资源

- [Chroma官方文档](https://docs.trychroma.com/)
- [Sentence Transformers](https://www.sbert.net/)
- [2.4文章原文](../../new/2.4-向量库基础Chroma本地部署.html)

## 📝 License

MIT License

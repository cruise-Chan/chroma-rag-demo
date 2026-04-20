#!/usr/bin/env python3
"""
Chroma RAG演示 - Embedding服务中间层
2.4文章配套代码：Node.js/Python中间层示例

说明：
1. 这个脚本展示了如何在后端生成真实的向量embedding
2. 前端只负责传文本，后端返回向量结果
3. 避免了浏览器端跑模型的性能问题

使用方法：
1. 安装依赖：pip install fastapi uvicorn sentence-transformers chromadb
2. 运行服务：python embedding-server.py
3. 前端调用：POST http://localhost:8001/embed
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import chromadb
from chromadb.config import Settings
import uvicorn

# 初始化FastAPI
app = FastAPI(title="Chroma Embedding Server")

# 配置CORS（允许前端跨域访问）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 生产环境应该限制具体域名
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 初始化Chroma客户端
chroma_client = chromadb.PersistentClient(path="./chroma_data")

# Embedding模型（首次加载会下载模型，约20MB）
print("正在加载embedding模型...")
from sentence_transformers import SentenceTransformer
embedding_model = SentenceTransformer('all-MiniLM-L6-v2')
print("模型加载完成！")


# ==================== 数据模型 ====================
class EmbedRequest(BaseModel):
    texts: List[str]
    model: Optional[str] = "all-MiniLM-L6-v2"


class IndexRequest(BaseModel):
    doc_id: str
    content: str
    collection: Optional[str] = "demo-documents"
    metadata: Optional[dict] = {}


class QueryRequest(BaseModel):
    query: str
    collection: Optional[str] = "demo-documents"
    n_results: Optional[int] = 3


# ==================== API端点 ====================
@app.get("/")
def root():
    return {
        "service": "Chroma Embedding Server",
        "status": "running",
        "endpoints": [
            "POST /embed - 生成向量",
            "POST /index - 索引文档",
            "POST /query - 向量检索",
            "GET /collections - 列出集合"
        ]
    }


@app.post("/embed")
def generate_embedding(request: EmbedRequest):
    """
    生成文本向量
    前端调用示例：
    fetch('http://localhost:8001/embed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts: ["你好世界"] })
    })
    """
    try:
        embeddings = embedding_model.encode(request.texts).tolist()
        return {
            "success": True,
            "embeddings": embeddings,
            "dimensions": len(embeddings[0]),
            "count": len(request.texts)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/index")
def index_document(request: IndexRequest):
    """
    索引文档（自动生成向量并存入Chroma）
    前端调用示例：
    fetch('http://localhost:8001/index', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        doc_id: "doc-1",
        content: "这是文档内容"
      })
    })
    """
    try:
        # 获取或创建集合
        collection = chroma_client.get_or_create_collection(
            name=request.collection,
            metadata={"description": "Demo collection"}
        )
        
        # 生成向量
        embedding = embedding_model.encode([request.content])[0].tolist()
        
        # 存入Chroma
        collection.add(
            ids=[request.doc_id],
            embeddings=[embedding],
            documents=[request.content],
            metadatas=[{
                **request.metadata,
                "indexed_at": __import__('datetime').datetime.now().isoformat()
            }]
        )
        
        return {
            "success": True,
            "message": f"文档 {request.doc_id} 索引成功",
            "doc_id": request.doc_id
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/query")
def query_documents(request: QueryRequest):
    """
    向量检索（自动将问题向量化并搜索）
    前端调用示例：
    fetch('http://localhost:8001/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: "如何优化性能？",
        n_results: 3
      })
    })
    
    返回的distances含义：
    - 数值越小代表相似度越高
    - < 0.3：非常相关
    - 0.3-0.5：比较相关
    - > 0.5：相关性较弱
    """
    try:
        # 获取集合
        collection = chroma_client.get_collection(name=request.collection)
        
        # 生成查询向量
        query_embedding = embedding_model.encode([request.query])[0].tolist()
        
        # 执行检索
        results = collection.query(
            query_embeddings=[query_embedding],
            n_results=request.n_results,
            include=["documents", "metadatas", "distances"]
        )
        
        # 格式化结果
        formatted_results = []
        if results['ids'] and results['ids'][0]:
            for i, doc_id in enumerate(results['ids'][0]):
                formatted_results.append({
                    "id": doc_id,
                    "document": results['documents'][0][i],
                    "metadata": results['metadatas'][0][i],
                    "distance": results['distances'][0][i],
                    "similarity": 1 - results['distances'][0][i]
                })
        
        return {
            "success": True,
            "query": request.query,
            "results": formatted_results,
            "count": len(formatted_results)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/collections")
def list_collections():
    """列出所有集合"""
    try:
        collections = chroma_client.list_collections()
        return {
            "success": True,
            "collections": [
                {
                    "name": col.name,
                    "metadata": col.metadata,
                    "count": col.count()
                }
                for col in collections
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/collection/{collection_name}")
def delete_collection(collection_name: str):
    """删除集合"""
    try:
        chroma_client.delete_collection(name=collection_name)
        return {
            "success": True,
            "message": f"集合 {collection_name} 已删除"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================== 启动服务 ====================
if __name__ == "__main__":
    print("=" * 60)
    print("🚀 Chroma Embedding Server 启动中...")
    print("=" * 60)
    print("📍 服务地址: http://localhost:8001")
    print("📚 API文档: http://localhost:8001/docs")
    print("=" * 60)
    
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8001,
        log_level="info"
    )

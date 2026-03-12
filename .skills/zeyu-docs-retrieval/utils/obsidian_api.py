#!/usr/bin/env python3
"""
Obsidian REST API 封装

提供与 Obsidian Local REST API 交互的功能：
- 读取文档内容
- 搜索文档
- 列出文件
"""

import requests
import time


class ObsidianAPI:
    """Obsidian REST API 客户端"""

    def __init__(self, api_url: str, api_key: str, timeout: int = 30):
        """
        初始化 API 客户端

        Args:
            api_url: API 地址（如 http://localhost:27123）
            api_key: API 密钥
            timeout: 请求超时时间（秒）
        """
        self.api_url = api_url.rstrip("/")
        self.api_key = api_key
        self.timeout = timeout
        self.headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }

    def _request(
        self, method: str, endpoint: str, max_retries: int = 3, **kwargs
    ) -> requests.Response | None:
        """
        发送 HTTP 请求，带重试机制

        Args:
            method: HTTP 方法（GET/POST/PUT/DELETE）
            endpoint: API 端点（如 /vault/）
            max_retries: 最大重试次数
            **kwargs: 传递给 requests 的其他参数

        Returns:
            Response 对象

        Raises:
            requests.RequestException: 请求失败
        """
        url = f"{self.api_url}{endpoint}"
        kwargs.setdefault("headers", self.headers)
        kwargs.setdefault("timeout", self.timeout)

        for attempt in range(max_retries):
            try:
                response = requests.request(method, url, **kwargs)
                response.raise_for_status()
                return response
            except requests.exceptions.RequestException as e:
                if attempt == max_retries - 1:
                    raise
                print(f"请求失败（尝试 {attempt + 1}/{max_retries}）：{e}")
                time.sleep(1 * (attempt + 1))  # 指数退避

    def read_note(self, path: str) -> str:
        """
        读取文档内容

        Args:
            path: 文档路径（相对于 vault 根目录，如 "02-PROJECTS/DiveBuddy.md"）

        Returns:
            文档内容（字符串）

        Raises:
            requests.RequestException: 读取失败
        """
        try:
            # 移除开头的斜杠（如果有）
            path = path.lstrip("/")
            response = self._request("GET", f"/vault/{path}")
            return response.text
        except requests.exceptions.HTTPError as e:
            if e.response.status_code == 404:
                raise FileNotFoundError(f"文档不存在：{path}")
            raise
        except Exception as e:
            raise RuntimeError(f"读取文档失败：{path}，错误：{e}")

    def search(self, query: str, limit: int = 10) -> list[dict]:
        """
        搜索文档

        Args:
            query: 搜索关键词
            limit: 返回结果数量上限

        Returns:
            搜索结果列表，每项包含：
            - filename: 文件名
            - score: 相关度分数（如果 API 提供）
            - content: 匹配的内容片段（如果 API 提供）

        Raises:
            requests.RequestException: 搜索失败
        """
        try:
            response = self._request(
                "POST",
                "/search/simple/",
                json={"query": query, "contextLength": 100},
            )
            results = response.json()

            # 限制返回数量
            if isinstance(results, list):
                return results[:limit]
            return []
        except Exception as e:
            print(f"搜索失败：{e}")
            return []

    def list_files(self, path: str = "") -> list[str]:
        """
        列出目录下的文件

        Args:
            path: 目录路径（相对于 vault 根目录，空字符串表示根目录）

        Returns:
            文件路径列表

        Raises:
            requests.RequestException: 列出文件失败
        """
        try:
            path = path.lstrip("/")
            endpoint = f"/vault/{path}/" if path else "/vault/"
            response = self._request("GET", endpoint)
            data = response.json()

            # API 返回格式可能是 {"files": [...]} 或直接是列表
            if isinstance(data, dict) and "files" in data:
                return data["files"]
            elif isinstance(data, list):
                return data
            return []
        except Exception as e:
            print(f"列出文件失败：{e}")
            return []

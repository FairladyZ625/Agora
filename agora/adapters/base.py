from abc import ABC, abstractmethod


class AgoraAdapter(ABC):
    """所有适配器必须实现的接口"""

    @abstractmethod
    async def provision_task(self, task_id: str, team: dict, workflow: dict) -> dict:
        """创建任务执行环境"""

    @abstractmethod
    async def dispatch_agent(self, agent_id: str, task_id: str, prompt: str) -> dict:
        """派发 Agent 到任务"""

    @abstractmethod
    async def query_agent_status(self, agent_id: str) -> dict:
        """查询 Agent 可用性"""

    @abstractmethod
    async def send_notification(self, channel: str, message: str) -> None:
        """发送通知"""

    @abstractmethod
    async def cleanup_task(self, task_id: str) -> None:
        """清理任务环境"""

"""Permission manager — allowAgents 权限矩阵 + 三路认证。

从 agora.json 加载配置，校验 Agent 间调用权限、advance 权限、Archon 身份。
"""
import json
from pathlib import Path


class PermissionManager:
    """权限矩阵管理器。"""

    def __init__(self, config: dict):
        perms = config.get("permissions", {})
        self.allow_agents = perms.get("allowAgents", {})
        self.archon_users = set(perms.get("archonUsers", []))
        self.command_auth = perms.get("commandAuth", {
            "requireAgentMatch": True,
            "requireSessionKey": True,
        })

    @classmethod
    def from_file(cls, path: str) -> "PermissionManager":
        config = json.loads(Path(path).read_text(encoding="utf-8"))
        return cls(config)

    def _get_agent_perms(self, agent_id: str) -> dict:
        if agent_id in self.allow_agents:
            return self.allow_agents[agent_id]
        return self.allow_agents.get("*", {"canCall": [], "canAdvance": False})

    def can_call(self, caller: str, target: str) -> bool:
        perms = self._get_agent_perms(caller)
        return target in perms.get("canCall", [])

    def can_advance(self, caller: str) -> bool:
        if caller in self.archon_users:
            return True
        perms = self._get_agent_perms(caller)
        return perms.get("canAdvance", False)

    def is_archon(self, user_id: str) -> bool:
        return user_id in self.archon_users

    def is_member(self, agent_id: str, team: dict) -> bool:
        return any(m["agentId"] == agent_id for m in team.get("members", []))

    def verify_subtask_done(self, caller_id: str, assignee_id: str) -> bool:
        if caller_id in self.archon_users:
            return True
        if not self.command_auth.get("requireAgentMatch", True):
            return True
        return caller_id == assignee_id

    def has_role(self, agent_id: str, team: dict, role: str) -> bool:
        for m in team.get("members", []):
            if m["agentId"] == agent_id and m["role"] == role:
                return True
        return agent_id in self.archon_users

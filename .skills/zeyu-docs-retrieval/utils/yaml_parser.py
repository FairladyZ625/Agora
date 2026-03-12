#!/usr/bin/env python3
"""
YAML Frontmatter 解析器

解析 Markdown 文档中的 YAML 元数据（Frontmatter）
"""

import re
import yaml


def parse_yaml_frontmatter(content: str) -> dict:
    """
    解析 YAML Frontmatter

    Args:
        content: Markdown 文档内容

    Returns:
        字典，包含：
        - yaml: YAML 元数据（dict）
        - content: 去除 Frontmatter 后的正文内容（str）

    Example:
        >>> content = '''---
        ... tags: [project, active]
        ... status: active
        ... ---
        ... # 文档标题
        ... 正文内容
        ... '''
        >>> result = parse_yaml_frontmatter(content)
        >>> result["yaml"]["status"]
        'active'
        >>> result["content"]
        '# 文档标题\\n正文内容\\n'
    """
    # 匹配 YAML Frontmatter：开头的 --- ... ---
    pattern = r"^---\s*\n(.*?)\n---\s*\n(.*)$"
    match = re.match(pattern, content, re.DOTALL)

    if not match:
        # 没有 Frontmatter，返回空 YAML 和原内容
        return {"yaml": {}, "content": content}

    yaml_text = match.group(1)
    body_content = match.group(2)

    try:
        yaml_data = yaml.safe_load(yaml_text) or {}
    except yaml.YAMLError as e:
        print(f"YAML 解析失败：{e}")
        yaml_data = {}

    return {"yaml": yaml_data, "content": body_content}


def validate_project_yaml(yaml_data: dict) -> bool:
    """
    验证项目文档的 YAML 元数据

    必需字段：
    - tags: 标签列表
    - status: 项目状态
    - created: 创建日期
    - updated: 更新日期

    Args:
        yaml_data: YAML 元数据字典

    Returns:
        True 如果验证通过，False 否则
    """
    required_fields = ["tags", "status", "created", "updated"]

    for field in required_fields:
        if field not in yaml_data:
            print(f"缺少必需字段：{field}")
            return False

    # 验证 tags 是列表
    if not isinstance(yaml_data.get("tags"), list):
        print("tags 必须是列表")
        return False

    # 验证 status 是字符串
    if not isinstance(yaml_data.get("status"), str):
        print("status 必须是字符串")
        return False

    return True


def extract_yaml_field(yaml_data: dict, field: str, default=None):
    """
    安全提取 YAML 字段

    Args:
        yaml_data: YAML 元数据字典
        field: 字段名（支持嵌套，如 "repository.url"）
        default: 默认值

    Returns:
        字段值，如果不存在则返回 default

    Example:
        >>> yaml_data = {"repository": {"url": "https://github.com/..."}}
        >>> extract_yaml_field(yaml_data, "repository.url")
        'https://github.com/...'
    """
    keys = field.split(".")
    value = yaml_data

    for key in keys:
        if isinstance(value, dict) and key in value:
            value = value[key]
        else:
            return default

    return value

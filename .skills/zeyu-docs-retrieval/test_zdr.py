#!/usr/bin/env python3
"""
测试脚本 - 验证所有命令的参数解析
"""

import sys
from pathlib import Path

# 添加父目录到 sys.path
sys.path.insert(0, str(Path(__file__).parent))

from zdr import parse_args, COMMANDS

def test_all_commands():
    """测试所有命令的参数解析"""

    test_cases = [
        # 项目定位命令
        ["list-projects"],
        ["list-projects", "--status=active"],
        ["list-projects", "--priority=high"],
        ["project-info", "DiveBuddy"],
        ["filter-projects", "--status=active", "--priority=high"],
        ["filter-projects", "--tags=Java,Spring"],

        # 文档导航命令
        ["docs-index", "DiveBuddy"],
        ["get-doc", "DiveBuddy", "CLAUDE.md"],
        ["list-docs", "DiveBuddy"],
        ["list-docs", "DiveBuddy", "--category=架构"],

        # 语义搜索命令
        ["search", "权限管理"],
        ["search", "权限管理", "--top-k=10"],
        ["search", "权限管理", "--threshold=0.8"],
        ["search-project", "权限管理", "--project=DiveBuddy"],
        ["similar-to", "02-PROJECTS/DiveBuddy.md"],

        # 上下文注入命令
        ["context", "DiveBuddy", "--task=实现行程匹配功能"],
        ["context", "DiveBuddy", "--task=实现行程匹配功能", "--include-history"],
        ["cross-project", "DiveBuddy", "AIMBSE", "--topic=权限管理"],
        ["history", "行程匹配功能"],
    ]

    print("测试所有命令的参数解析...\n")

    passed = 0
    failed = 0

    for test_case in test_cases:
        try:
            # 临时替换 sys.argv
            original_argv = sys.argv
            sys.argv = ["zdr.py"] + test_case

            # 解析参数
            args = parse_args()

            # 恢复 sys.argv
            sys.argv = original_argv

            print(f"✓ {' '.join(test_case)}")
            passed += 1

        except SystemExit:
            # parse_args 在没有参数时会调用 sys.exit(0)
            sys.argv = original_argv
            print(f"✗ {' '.join(test_case)} - SystemExit")
            failed += 1
        except Exception as e:
            sys.argv = original_argv
            print(f"✗ {' '.join(test_case)} - {e}")
            failed += 1

    print(f"\n总计: {passed} 通过, {failed} 失败")

    # 验证命令路由表
    print(f"\n命令路由表包含 {len(COMMANDS)} 个命令:")
    for cmd in COMMANDS:
        print(f"  - {cmd}")

    return failed == 0


if __name__ == "__main__":
    success = test_all_commands()
    sys.exit(0 if success else 1)

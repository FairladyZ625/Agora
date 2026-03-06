"""Agora CLI — typer-based command-line interface for task management."""
import typer
from rich.console import Console
from rich.table import Table

from agora.core.db import DatabaseManager
from agora.core.task_mgr import TaskManager

app = typer.Typer(name="agora", help="Agora — Multi-Agent Democratic Orchestration CLI")
console = Console()


def get_manager() -> TaskManager:
    """Initialize DB + TaskManager."""
    db = DatabaseManager(db_path="tasks.db")
    db.initialize()
    return TaskManager(db)


@app.command()
def create(
    title: str = typer.Argument(..., help="任务标题"),
    type: str = typer.Option("coding", "--type", "-t", help="任务类型: coding/coding_heavy/research/document/quick/brainstorm"),
    priority: str = typer.Option("normal", "--priority", "-p", help="优先级: high/normal/low"),
    creator: str = typer.Option("archon", "--creator", "-c", help="创建者"),
):
    """创建新任务。"""
    mgr = get_manager()
    task = mgr.create_task(title=title, task_type=type, creator=creator, priority=priority)
    console.print(f"[green]✓[/green] 任务已创建: {task['id']}")
    console.print(f"  标题: {task['title']}")
    console.print(f"  类型: {task['type']}")
    console.print(f"  状态: {task['state']}")
    console.print(f"  阶段: {task['current_stage']}")


@app.command()
def status(task_id: str = typer.Argument(..., help="任务 ID (如 OC-001)")):
    """查看任务状态详情。"""
    mgr = get_manager()
    task = mgr.get_task(task_id)
    if not task:
        console.print(f"[red]✗[/red] 任务 {task_id} 不存在")
        raise typer.Exit(1)

    console.print(f"\n[bold]{task['id']}[/bold] — {task['title']}")
    console.print(f"  类型: {task['type']}  优先级: {task['priority']}  状态: [bold]{task['state']}[/bold]")
    console.print(f"  创建者: {task['creator']}  创建时间: {task['created_at']}")

    if task.get('workflow') and task['workflow'].get('stages'):
        console.print("\n  [bold]工作流阶段:[/bold]")
        for stage in task['workflow']['stages']:
            marker = "→" if stage['id'] == task.get('current_stage') else " "
            console.print(f"    {marker} {stage['id']} ({stage['name']}) — gate: {stage['gate']['type']}")

    if task.get('team') and task['team'].get('members'):
        console.print("\n  [bold]团队:[/bold]")
        for member in task['team']['members']:
            console.print(f"    {member['role']}: {member['agentId']}")

    logs = mgr.db.get_flow_logs(task_id)
    if logs:
        console.print(f"\n  [bold]Flow Log ({len(logs)} 条):[/bold]")
        for log in logs[-5:]:
            console.print(f"    [{log['created_at']}] {log['event']} ({log['kind']})")


@app.command(name="list")
def list_tasks(
    state: str = typer.Option(None, "--state", "-s", help="按状态筛选"),
):
    """列出任务。"""
    mgr = get_manager()
    tasks = mgr.list_tasks(state_filter=state)
    if not tasks:
        console.print("[dim]没有找到任务[/dim]")
        return

    table = Table(title="Agora 任务列表")
    table.add_column("ID", style="cyan")
    table.add_column("标题")
    table.add_column("类型")
    table.add_column("状态", style="bold")
    table.add_column("阶段")
    table.add_column("创建时间")

    for task in tasks:
        table.add_row(
            task['id'], task['title'], task['type'],
            task['state'], task.get('current_stage', '-'),
            task['created_at'][:16],
        )
    console.print(table)


@app.command()
def advance(
    task_id: str = typer.Argument(..., help="任务 ID"),
    caller: str = typer.Option("archon", "--caller", help="调用者 ID"),
):
    """推进任务到下一阶段。"""
    mgr = get_manager()
    try:
        task = mgr.advance_task(task_id, caller_id=caller)
        if task['state'] == 'done':
            console.print(f"[green]✓[/green] 任务 {task_id} 已完成!")
        else:
            console.print(f"[green]✓[/green] 任务 {task_id} 已推进到阶段: {task['current_stage']}")
    except (ValueError, PermissionError) as e:
        console.print(f"[red]✗[/red] 推进失败: {e}")
        raise typer.Exit(1)


@app.command()
def approve(
    task_id: str = typer.Argument(..., help="任务 ID"),
    caller: str = typer.Option("archon", "--caller", help="审批者 ID"),
    comment: str = typer.Option("", "--comment", help="审批备注"),
):
    """审批通过当前阶段。"""
    mgr = get_manager()
    try:
        mgr.approve_task(task_id, approver_id=caller, comment=comment)
        console.print(f"[green]✓[/green] 任务 {task_id} 已审批通过")
    except (ValueError, PermissionError) as e:
        console.print(f"[red]✗[/red] 审批失败: {e}")
        raise typer.Exit(1)


@app.command()
def reject(
    task_id: str = typer.Argument(..., help="任务 ID"),
    reason: str = typer.Option("", "--reason", help="驳回原因"),
    caller: str = typer.Option("archon", "--caller", help="驳回者 ID"),
):
    """驳回当前阶段。"""
    mgr = get_manager()
    try:
        mgr.reject_task(task_id, rejector_id=caller, reason=reason)
        console.print(f"[yellow]![/yellow] 任务 {task_id} 已驳回")
    except ValueError as e:
        console.print(f"[red]✗[/red] 驳回失败: {e}")
        raise typer.Exit(1)

@app.command(name="archon-approve")
def archon_approve(
    task_id: str = typer.Argument(..., help="任务 ID"),
    caller: str = typer.Option("lizeyu", "--caller", help="Archon 用户 ID"),
    comment: str = typer.Option("", "--comment", help="备注"),
):
    """Archon 审批通过。"""
    mgr = get_manager()
    try:
        mgr.archon_approve(task_id, reviewer_id=caller, comment=comment)
        console.print(f"[green]✓[/green] Archon 已审批通过 {task_id}")
    except (ValueError, PermissionError) as e:
        console.print(f"[red]✗[/red] Archon 审批失败: {e}")
        raise typer.Exit(1)


@app.command(name="archon-reject")
def archon_reject(
    task_id: str = typer.Argument(..., help="任务 ID"),
    reason: str = typer.Option("", "--reason", help="驳回原因"),
    caller: str = typer.Option("lizeyu", "--caller", help="Archon 用户 ID"),
):
    """Archon 驳回。"""
    mgr = get_manager()
    try:
        mgr.archon_reject(task_id, reviewer_id=caller, reason=reason)
        console.print(f"[yellow]![/yellow] Archon 已驳回 {task_id}")
    except (ValueError, PermissionError) as e:
        console.print(f"[red]✗[/red] Archon 驳回失败: {e}")
        raise typer.Exit(1)


@app.command()
def confirm(
    task_id: str = typer.Argument(..., help="任务 ID"),
    vote: str = typer.Option("approve", "--vote", help="投票: approve/reject"),
    caller: str = typer.Option("archon", "--caller", help="投票者 ID"),
    comment: str = typer.Option("", "--comment", help="备注"),
):
    """Quorum 投票。"""
    mgr = get_manager()
    try:
        result = mgr.confirm_task(task_id, voter_id=caller, vote=vote, comment=comment)
        quorum = result.get("quorum", {})
        console.print(f"[green]✓[/green] 已投票 ({vote}) — 当前 {quorum.get('approved', 0)}/{quorum.get('total', 0)}")
    except (ValueError, PermissionError) as e:
        console.print(f"[red]✗[/red] 投票失败: {e}")
        raise typer.Exit(1)


@app.command(name="subtask-done")
def subtask_done(
    task_id: str = typer.Argument(..., help="任务 ID"),
    subtask_id: str = typer.Argument(..., help="子任务 ID"),
    caller: str = typer.Option("archon", "--caller", help="调用者 ID"),
    output: str = typer.Option("", "--output", help="子任务输出"),
):
    """标记子任务完成。"""
    mgr = get_manager()
    try:
        mgr.complete_subtask(task_id, subtask_id, caller_id=caller, output=output)
        console.print(f"[green]✓[/green] 子任务 {subtask_id} 已完成")
    except ValueError as e:
        console.print(f"[red]✗[/red] 失败: {e}")
        raise typer.Exit(1)


@app.command(name="force-advance")
def force_advance(
    task_id: str = typer.Argument(..., help="任务 ID"),
    reason: str = typer.Option("", "--reason", help="强制推进原因"),
):
    """强制推进（Archon 覆盖）。"""
    mgr = get_manager()
    try:
        task = mgr.force_advance(task_id, reason=reason)
        if task['state'] == 'done':
            console.print(f"[green]✓[/green] 任务 {task_id} 已强制完成!")
        else:
            console.print(f"[green]✓[/green] 任务 {task_id} 已强制推进到: {task['current_stage']}")
    except ValueError as e:
        console.print(f"[red]✗[/red] 强制推进失败: {e}")
        raise typer.Exit(1)


@app.command()
def unblock(
    task_id: str = typer.Argument(..., help="任务 ID"),
    reason: str = typer.Option("", "--reason", help="解除阻塞原因"),
):
    """解除任务阻塞。"""
    mgr = get_manager()
    try:
        mgr.unblock_task(task_id, reason=reason)
        console.print(f"[green]✓[/green] 任务 {task_id} 已解除阻塞")
    except ValueError as e:
        console.print(f"[red]✗[/red] 解除阻塞失败: {e}")
        raise typer.Exit(1)


@app.command()
def pause(
    task_id: str = typer.Argument(..., help="任务 ID"),
    reason: str = typer.Option("", "--reason", help="暂停原因"),
):
    """暂停任务。"""
    mgr = get_manager()
    try:
        mgr.pause_task(task_id, reason=reason)
        console.print(f"[yellow]⏸[/yellow] 任务 {task_id} 已暂停")
    except ValueError as e:
        console.print(f"[red]✗[/red] 暂停失败: {e}")
        raise typer.Exit(1)


@app.command()
def resume(task_id: str = typer.Argument(..., help="任务 ID")):
    """恢复暂停的任务。"""
    mgr = get_manager()
    try:
        mgr.resume_task(task_id)
        console.print(f"[green]✓[/green] 任务 {task_id} 已恢复")
    except ValueError as e:
        console.print(f"[red]✗[/red] 恢复失败: {e}")
        raise typer.Exit(1)


@app.command()
def cancel(
    task_id: str = typer.Argument(..., help="任务 ID"),
    reason: str = typer.Option("", "--reason", help="取消原因"),
):
    """取消任务。"""
    mgr = get_manager()
    try:
        mgr.cancel_task(task_id, reason=reason)
        console.print(f"[red]✗[/red] 任务 {task_id} 已取消")
    except ValueError as e:
        console.print(f"[red]✗[/red] 取消失败: {e}")
        raise typer.Exit(1)


@app.command()
def cleanup(
    task_id: str = typer.Argument(None, help="指定任务 ID"),
    all_orphaned: bool = typer.Option(False, "--all-orphaned", help="清理所有 orphaned 任务"),
):
    """清理 orphaned 任务。"""
    mgr = get_manager()
    if task_id:
        count = mgr.cleanup_orphaned(task_id)
    elif all_orphaned:
        count = mgr.cleanup_orphaned()
    else:
        console.print("[yellow]请指定 task_id 或使用 --all-orphaned[/yellow]")
        raise typer.Exit(1)
    console.print(f"[green]✓[/green] 已清理 {count} 个 orphaned 任务")


if __name__ == "__main__":
    app()

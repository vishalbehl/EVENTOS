from app.modules.operations_control.models import TaskFailure


def test_task_failure_model_matches_applied_operations_schema():
    assert TaskFailure.__table__.schema == "operations"
    assert TaskFailure.__table__.name == "task_failures"

from src.services.slash_commands import parse_slash_command


def test_slash_logic_only():
    task, message = parse_slash_command("/logic")
    assert task == "logic"
    assert message == "Kiểm tra logic bài báo"


def test_slash_logic_with_args():
    task, message = parse_slash_command("/logic check introduction flow")
    assert task == "logic"
    assert message == "check introduction flow"


def test_slash_unknown_passthrough():
    task, message = parse_slash_command("/unknown foo")
    assert task is None
    assert message == "/unknown foo"


def test_no_slash_passthrough():
    task, message = parse_slash_command("Kiểm tra logic bài báo")
    assert task is None
    assert message == "Kiểm tra logic bài báo"

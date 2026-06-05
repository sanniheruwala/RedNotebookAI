"""Trino connector config + connector wiring tests."""

import pytest

pytest.importorskip("pydantic")

from pydantic import SecretStr  # noqa: E402

from rednotebook.connectors.registry import (  # noqa: E402
    available_connectors,
    get_connector_class,
)
from rednotebook.connectors.trino import (  # noqa: E402
    TrinoConnectionConfig,
    TrinoConnector,
)


def test_trino_registered():
    assert "trino" in available_connectors()
    assert get_connector_class("trino") is TrinoConnector


def test_trino_config_minimum():
    cfg = TrinoConnectionConfig(
        connection_name="test",
        host="trino.example.com",
        user="alice",
    )
    assert cfg.connector_type == "trino"
    assert cfg.scheme == "https"
    assert cfg.port == 443
    assert cfg.verify_ssl is True


def test_trino_config_with_password():
    cfg = TrinoConnectionConfig(
        connection_name="x",
        host="h",
        user="u",
        password=SecretStr("secret"),
    )
    assert cfg.password is not None
    assert cfg.password.get_secret_value() == "secret"


def test_trino_connector_attaches_config():
    cfg = TrinoConnectionConfig(connection_name="x", host="h", user="u")
    connector = TrinoConnector(cfg)
    assert connector.name == "x"
    assert connector.config.host == "h"

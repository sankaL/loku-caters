import importlib.util
import os
from pathlib import Path
import unittest

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("RESEND_API_KEY", "test-key")

from database import Base
import models  # noqa: F401


class RowLevelSecurityMigrationTests(unittest.TestCase):
    def test_hardening_migration_covers_every_application_table(self):
        migration_path = (
            Path(__file__).resolve().parents[1]
            / "alembic"
            / "versions"
            / "0026_harden_row_level_security.py"
        )
        spec = importlib.util.spec_from_file_location(
            "rls_hardening_migration", migration_path
        )
        self.assertIsNotNone(spec)
        self.assertIsNotNone(spec.loader)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)

        expected_tables = set(Base.metadata.tables) | {"alembic_version"}
        self.assertEqual(set(module._TABLES), expected_tables)
        self.assertEqual(module._POLICY_NAME, "deny_direct_api_access")


if __name__ == "__main__":
    unittest.main()

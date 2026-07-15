import importlib.util
import os
from pathlib import Path
import unittest

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")
os.environ.setdefault("RESEND_API_KEY", "test-key")

from sqlalchemy import text
from sqlalchemy.exc import DBAPIError

from database import Base, engine
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

    @unittest.skipUnless(
        engine.dialect.name == "postgresql",
        "PostgreSQL is required to verify RLS enforcement",
    )
    def test_postgresql_enforces_backend_only_access(self):
        expected_tables = set(Base.metadata.tables) | {"alembic_version"}
        with engine.connect() as connection:
            api_role_count = connection.execute(
                text(
                    "SELECT COUNT(*) FROM pg_roles "
                    "WHERE rolname IN ('anon', 'authenticated')"
                )
            ).scalar_one()
            if api_role_count != 2:
                self.skipTest("Supabase API roles are not present in this PostgreSQL")

            secured_tables = set(
                connection.execute(
                    text(
                        "SELECT c.relname FROM pg_class c "
                        "JOIN pg_namespace n ON n.oid = c.relnamespace "
                        "WHERE n.nspname = 'public' AND c.relrowsecurity"
                    )
                ).scalars()
            )
            self.assertTrue(expected_tables.issubset(secured_tables))

            policy_rows = connection.execute(
                text(
                    "SELECT tablename, permissive, cmd, qual, with_check "
                    "FROM pg_policies WHERE schemaname = 'public' "
                    "AND policyname = 'deny_direct_api_access'"
                )
            ).mappings()
            policies = {row["tablename"]: row for row in policy_rows}
            self.assertEqual(set(policies), expected_tables)
            for row in policies.values():
                self.assertEqual(row["permissive"], "RESTRICTIVE")
                self.assertEqual(row["cmd"], "ALL")
                self.assertEqual(row["qual"], "false")
                self.assertEqual(row["with_check"], "false")

            direct_grants = connection.execute(
                text(
                    "SELECT COUNT(*) FROM information_schema.role_table_grants "
                    "WHERE table_schema = 'public' "
                    "AND grantee IN ('anon', 'authenticated')"
                )
            ).scalar_one()
            sequence_grants = connection.execute(
                text(
                    "SELECT COUNT(*) FROM information_schema.role_usage_grants "
                    "WHERE object_schema = 'public' "
                    "AND grantee IN ('anon', 'authenticated')"
                )
            ).scalar_one()
            self.assertEqual(direct_grants, 0)
            self.assertEqual(sequence_grants, 0)

            for table in sorted(expected_tables):
                connection.execute(text(f'SELECT 1 FROM public."{table}" LIMIT 0'))

        for role in ("anon", "authenticated"):
            with engine.connect() as connection:
                transaction = connection.begin()
                connection.execute(text(f'SET LOCAL ROLE "{role}"'))
                with self.assertRaises(DBAPIError):
                    connection.execute(text("SELECT 1 FROM public.orders LIMIT 0"))
                transaction.rollback()


if __name__ == "__main__":
    unittest.main()

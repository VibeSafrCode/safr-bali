"""Read only the current migration graph; never import settings or connect."""
import ast
from pathlib import Path
import unittest

VERSIONS = Path(__file__).resolve().parents[1] / "alembic" / "versions"


def graph():
    revisions = {}
    for path in VERSIONS.glob("*.py"):
        values = {}
        tree = ast.parse(path.read_text(encoding="utf8"), filename=str(path))
        for node in tree.body:
            if isinstance(node, (ast.Assign, ast.AnnAssign)):
                targets = node.targets if isinstance(node, ast.Assign) else [node.target]
                for target in targets:
                    if isinstance(target, ast.Name) and target.id in ("revision", "down_revision"):
                        values[target.id] = ast.literal_eval(node.value)
        if "revision" not in values:
            continue
        revision = values["revision"]
        if revision in revisions:
            raise AssertionError("Duplicate migration revision")
        parent = values["down_revision"]
        revisions[revision] = () if parent is None else (parent,) if isinstance(parent, str) else parent
    return revisions


class ClientUIMigrationGraphTests(unittest.TestCase):
    def test_one_explicit_head_and_no_missing_or_cyclic_parent(self):
        rows = graph()
        parents = {p for values in rows.values() for p in values}
        self.assertLessEqual(parents, rows.keys())
        self.assertEqual(set(rows) - parents, {"f13a7c5d920b"})
        visiting, done = set(), set()

        def visit(revision):
            self.assertNotIn(revision, visiting)
            if revision in done:
                return
            visiting.add(revision)
            for parent in rows[revision]:
                visit(parent)
            visiting.remove(revision)
            done.add(revision)

        visit("f13a7c5d920b")
        self.assertEqual(done, set(rows))

    def test_historical_parents_retained_and_noop_merge(self):
        rows = graph()
        self.assertEqual(rows["c52e8b6d9041"], ("a1f9c3d7e620",))
        self.assertEqual(rows["b6a1d3f0e214"], ("a1f9c3d7e620",))
        self.assertEqual(rows["d4082b5a16c9"], ("b6a1d3f0e214",))
        self.assertEqual(rows["e73b2c9a610f"], ("c52e8b6d9041", "d4082b5a16c9"))
        self.assertEqual(rows["f13a7c5d920b"], ("e73b2c9a610f",))
        self.assertEqual(rows["5554c63c35ae"], ())
        self.assertEqual(rows["d7a2f9c4e816"], ("c6a4e8b2d915",))
        self.assertEqual(len(rows), len(list(VERSIONS.glob("*.py"))))
        tree = ast.parse((VERSIONS / "e73b2c9a610f_merge_client_ui_and_messaging.py").read_text(encoding="utf8"))
        self.assertFalse(any(isinstance(n, (ast.Import, ast.ImportFrom, ast.Call)) for n in ast.walk(tree)))
        handlers = {n.name: n for n in tree.body if isinstance(n, ast.FunctionDef)}
        self.assertEqual(set(handlers), {"upgrade", "downgrade"})
        self.assertTrue(all(len(n.body) == 1 and isinstance(n.body[0], ast.Pass) for n in handlers.values()))


if __name__ == "__main__":
    unittest.main()

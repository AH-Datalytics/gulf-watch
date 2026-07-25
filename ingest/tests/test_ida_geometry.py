"""Geometry-size safeguards for the historical Ida wind maps."""

from scripts.build_ida_sample import _simplify_ring


def test_simplify_ring_removes_redundant_vertices_and_stays_closed():
    ring = [
        [0, 0],
        [1, 0],
        [2, 0],
        [3, 0],
        [3, 1],
        [3, 2],
        [3, 3],
        [2, 3],
        [1, 3],
        [0, 3],
        [0, 2],
        [0, 1],
        [0, 0],
    ]
    simplified = _simplify_ring(ring, tolerance=0.01)
    assert simplified[0] == simplified[-1]
    assert len(simplified) >= 4
    assert len(simplified) < len(ring)


def test_simplify_ring_preserves_small_valid_ring():
    ring = [[0, 0], [1, 0], [0, 1], [0, 0]]
    assert _simplify_ring(ring) == ring

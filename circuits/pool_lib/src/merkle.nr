use poseidon::poseidon2::Poseidon2;

pub fn compute_root<let DEPTH: u32>(leaf: Field, index: u64, path: [Field; DEPTH]) -> Field {
    assert((index >> (DEPTH as u64)) == 0, "index outside the tree");
    let mut node = leaf;
    for level in 0..DEPTH {
        let is_right = ((index >> (level as u64)) & 1) == 1;
        let sibling = path[level];
        node = if is_right {
            Poseidon2::hash([sibling, node], 2)
        } else {
            Poseidon2::hash([node, sibling], 2)
        };
    }
    node
}

pub fn assert_membership<let DEPTH: u32>(leaf: Field, index: u64, path: [Field; DEPTH], root: Field) {
    assert(compute_root(leaf, index, path) == root, "not a member of the tree");
}

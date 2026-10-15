use pool_lib::note::Note;

fn main(commitment: pub Field, amount: pub u64, asset: pub u8, label: pub Field, note: Note) {
    assert(note.commitment() == commitment, "commitment does not match the note");
    assert(note.amount == amount, "note value differs from the deposit");
    assert(amount != 0, "empty deposit");
    assert(note.asset == asset, "note asset differs from the deposit");
    assert(note.label == label, "note label differs from the deposit label");
    assert((note.box_id >= 1) & (note.box_id <= 6), "unknown box");
    assert((asset >= 1) & (asset <= 2), "unknown asset");
    assert(note.flags <= 1, "unknown flags");
}

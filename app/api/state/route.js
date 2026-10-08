import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const blocks = await query(
      'SELECT id, name, capacity FROM blocks ORDER BY id LIMIT 1'
    );

    if (blocks.length === 0) {
      return Response.json({ ready: false });
    }

    const block = blocks[0];

    const slots = await query(
      `SELECT slot_number, status, item_ref
         FROM slots
        WHERE block_id = $1
        ORDER BY slot_number`,
      [block.id]
    );

    const positions = await query(
      'SELECT id, name, latitude, longitude FROM positions WHERE active ORDER BY name'
    );

    const target = await query(
      `SELECT id, block_id, latitude, longitude, label, updated_at
         FROM target_points
        WHERE block_id = $1
        ORDER BY updated_at DESC, id DESC
        LIMIT 1`,
      [block.id]
    );

    const events = await query(
      `SELECT e.id,
              e.occurred_at,
              e.quantity,
              e.operator,
              e.launch_latitude,
              e.launch_longitude,
              e.target_latitude,
              e.target_longitude,
              p.name AS position,
              string_agg(s.slot_number::text, ', ' ORDER BY s.slot_number) AS slots
         FROM dispatch_events e
         JOIN positions p ON p.id = e.position_id
         JOIN dispatch_event_slots s ON s.event_id = e.id
        WHERE e.block_id = $1
        GROUP BY e.id, p.name
        ORDER BY e.id DESC
        LIMIT 12`,
      [block.id]
    );

    // Capacity is counted from the slot rows, never read from a stored total.
    const occupied = slots.filter((s) => s.status === 'occupied').length;

    return Response.json({
      ready: true,
      block: {
        id: block.id,
        name: block.name,
        capacity: block.capacity,
        occupied,
        available: slots.filter((s) => s.status === 'empty').length,
      },
      slots,
      positions,
      target: target[0] || null,
      events,
    });
  } catch (err) {
    console.error(err);
    return Response.json(
      { error: 'Could not read block state. Check DATABASE_URL and run setup.' },
      { status: 500 }
    );
  }
}

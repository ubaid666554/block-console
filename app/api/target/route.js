import { withTransaction } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const body = await request.json();
    const blockId = Number(body.blockId);
    const latitude = Number(body.latitude);
    const longitude = Number(body.longitude);
    const label = (body.label || 'Target').trim();

    if (!blockId || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return Response.json({ error: 'A valid block and target coordinates are required.' }, { status: 400 });
    }

    const result = await withTransaction(async (client) => {
      const existing = await client.query(
        'SELECT id FROM target_points WHERE block_id = $1',
        [blockId]
      );

      if (existing.rowCount > 0) {
        const saved = await client.query(
          `UPDATE target_points
              SET latitude = $2,
                  longitude = $3,
                  label = $4,
                  updated_at = now()
            WHERE block_id = $1
            RETURNING id, block_id, latitude, longitude, label`,
          [blockId, latitude, longitude, label || 'Target']
        );

        return saved.rows[0];
      }

      const saved = await client.query(
        `INSERT INTO target_points (block_id, latitude, longitude, label)
         VALUES ($1, $2, $3, $4)
         RETURNING id, block_id, latitude, longitude, label`,
        [blockId, latitude, longitude, label || 'Target']
      );

      return saved.rows[0];
    });

    return Response.json({ ok: true, target: result });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Could not save target location.' }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const body = await request.json();
    const blockId = Number(body.blockId);

    if (!blockId) {
      return Response.json({ error: 'A valid block is required.' }, { status: 400 });
    }

    await withTransaction((client) =>
      client.query('DELETE FROM target_points WHERE block_id = $1', [blockId])
    );

    return Response.json({ ok: true });
  } catch (error) {
    console.error(error);
    return Response.json({ error: 'Could not clear target location.' }, { status: 500 });
  }
}

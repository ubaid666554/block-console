import { readFile } from 'fs/promises';
import path from 'path';
import { withTransaction } from '@/lib/db';

export const dynamic = 'force-dynamic';

const CAPACITY = 24;

/**
 * Creates the schema (if absent) and seeds one full block plus three positions.
 * Safe to call more than once: seeding is skipped when a block already exists.
 */
export async function POST() {
  try {
    const schema = await readFile(
      path.join(process.cwd(), 'db', 'schema.sql'),
      'utf8'
    );

    const outcome = await withTransaction(async (client) => {
      await client.query(schema);

      const existing = await client.query('SELECT id FROM blocks LIMIT 1');
      if (existing.rowCount > 0) {
        return { created: false, message: 'Database already set up.' };
      }

      const block = await client.query(
        'INSERT INTO blocks (name, capacity) VALUES ($1, $2) RETURNING id',
        ['Block A', CAPACITY]
      );
      const blockId = block.rows[0].id;

      for (let n = 1; n <= CAPACITY; n++) {
        await client.query(
          `INSERT INTO slots (block_id, slot_number, status, item_ref)
           VALUES ($1, $2, 'occupied', $3)`,
          [blockId, n, `ITEM-${String(blockId).padStart(2, '0')}-${String(n).padStart(2, '0')}`]
        );
      }

      const positions = [
        ['Site North', 33.6844, 73.0479],
        ['Site East', 33.71, 73.11],
        ['Site Ridge', 33.65, 73.02],
      ];
      for (const [name, lat, lon] of positions) {
        await client.query(
          'INSERT INTO positions (name, latitude, longitude) VALUES ($1, $2, $3)',
          [name, lat, lon]
        );
      }

      return { created: true, message: `Block A created with ${CAPACITY} slots.` };
    });

    return Response.json(outcome);
  } catch (err) {
    console.error(err);
    return Response.json(
      { error: 'Setup failed. Check that DATABASE_URL is set and reachable.' },
      { status: 500 }
    );
  }
}

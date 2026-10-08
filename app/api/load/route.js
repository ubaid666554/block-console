import { withTransaction, RuleError } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Request body must be JSON.' }, { status: 400 });
  }

  const blockId = Number(body.blockId);
  const quantity = Number(body.quantity);
  const operator = (body.operator || '').trim();

  if (!blockId) {
    return Response.json({ error: 'Select a block.' }, { status: 400 });
  }
  if (!Number.isInteger(quantity) || quantity < 1) {
    return Response.json({ error: 'Quantity must be a whole number of 1 or more.' }, { status: 400 });
  }
  if (!operator) {
    return Response.json({ error: 'Enter an operator name.' }, { status: 400 });
  }

  try {
    const result = await withTransaction(async (client) => {
      const targets = await client.query(
        `SELECT id, slot_number
           FROM slots
          WHERE block_id = $1 AND status = 'empty'
          ORDER BY slot_number
          LIMIT $2
            FOR UPDATE`,
        [blockId, quantity]
      );

      if (targets.rowCount < quantity) {
        throw new RuleError(
          `Only ${targets.rowCount} slot${targets.rowCount === 1 ? '' : 's'} free, but ${quantity} were requested.`
        );
      }

      for (const slot of targets.rows) {
        const ref = `ITEM-${String(blockId).padStart(2, '0')}-${String(slot.slot_number).padStart(2, '0')}`;
        await client.query(
          `UPDATE slots
              SET status = 'occupied', item_ref = $2, updated_at = now()
            WHERE id = $1`,
          [slot.id, ref]
        );
        await client.query(
          `INSERT INTO slot_history (slot_id, from_status, to_status, reason, operator)
           VALUES ($1, 'empty', 'occupied', 'load', $2)`,
          [slot.id, operator]
        );
      }

      return { filled: targets.rows.map((r) => r.slot_number) };
    });

    return Response.json(result);
  } catch (err) {
    if (err instanceof RuleError) {
      return Response.json({ error: err.message }, { status: 409 });
    }
    console.error(err);
    return Response.json({ error: 'Load failed. No slots were changed.' }, { status: 500 });
  }
}

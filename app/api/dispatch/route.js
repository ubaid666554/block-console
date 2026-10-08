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
  const positionId = Number(body.positionId);
  const launchLatitude = Number(body.launchLatitude);
  const launchLongitude = Number(body.launchLongitude);
  const targetLatitude = Number(body.targetLatitude);
  const targetLongitude = Number(body.targetLongitude);
  const quantity = Number(body.quantity);
  const operator = (body.operator || '').trim();
  const selectedSlots = Array.isArray(body.selectedSlots)
    ? [...new Set(body.selectedSlots.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0))]
    : [];

  if (!blockId || !positionId) {
    return Response.json({ error: 'A valid block and launch position are required.' }, { status: 400 });
  }
  if (![launchLatitude, launchLongitude, targetLatitude, targetLongitude].every(Number.isFinite)) {
    return Response.json({ error: 'Set the current launch location and a target on the map.' }, { status: 400 });
  }

  const effectiveQuantity = selectedSlots.length > 0 ? selectedSlots.length : quantity;
  if (!Number.isInteger(effectiveQuantity) || effectiveQuantity < 1) {
    return Response.json({ error: 'Quantity must be a whole number of 1 or more.' }, { status: 400 });
  }
  if (!operator) {
    return Response.json({ error: 'Enter an operator name.' }, { status: 400 });
  }

  try {
    const result = await withTransaction(async (client) => {
      const position = await client.query(
        'SELECT id, name, active FROM positions WHERE id = $1',
        [positionId]
      );
      if (position.rowCount === 0) throw new RuleError('That position does not exist.');
      if (!position.rows[0].active) throw new RuleError('That position is not active.');

      // FOR UPDATE locks the candidate rows for the life of the transaction, so
      // two operators dispatching at the same moment cannot claim the same slots.
      let targets;
      if (selectedSlots.length > 0) {
        targets = await client.query(
          `SELECT id, slot_number, item_ref
             FROM slots
            WHERE block_id = $1 AND slot_number = ANY($2) AND status = 'occupied'
            ORDER BY slot_number
              FOR UPDATE`,
          [blockId, selectedSlots]
        );

        if (targets.rowCount !== selectedSlots.length) {
          throw new RuleError('One or more selected slots are not available for launch.');
        }
      } else {
        targets = await client.query(
          `SELECT id, slot_number, item_ref
             FROM slots
            WHERE block_id = $1 AND status = 'occupied'
            ORDER BY slot_number
            LIMIT $2
              FOR UPDATE`,
          [blockId, effectiveQuantity]
        );

        if (targets.rowCount < effectiveQuantity) {
          throw new RuleError(
            `Block holds ${targets.rowCount} item${targets.rowCount === 1 ? '' : 's'}, but ${effectiveQuantity} were requested.`
          );
        }
      }

      const event = await client.query(
        `INSERT INTO dispatch_events
          (block_id, position_id, launch_latitude, launch_longitude, target_latitude, target_longitude, operator, quantity)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, occurred_at`,
        [blockId, positionId, launchLatitude, launchLongitude, targetLatitude, targetLongitude, operator, targets.rowCount]
      );
      const eventId = event.rows[0].id;

      for (const slot of targets.rows) {
        await client.query(
          `INSERT INTO dispatch_event_slots (event_id, slot_id, slot_number, item_ref)
           VALUES ($1, $2, $3, $4)`,
          [eventId, slot.id, slot.slot_number, slot.item_ref]
        );
        await client.query(
          `UPDATE slots
              SET status = 'empty', item_ref = NULL, updated_at = now()
            WHERE id = $1`,
          [slot.id]
        );
        await client.query(
          `INSERT INTO slot_history (slot_id, from_status, to_status, reason, operator)
           VALUES ($1, 'occupied', 'empty', 'dispatch', $2)`,
          [slot.id, operator]
        );
      }

      return {
        eventId,
        position: position.rows[0].name,
        quantity: targets.rowCount,
        released: targets.rows.map((r) => r.slot_number),
      };
    });

    return Response.json(result);
  } catch (err) {
    if (err instanceof RuleError) {
      return Response.json({ error: err.message }, { status: 409 });
    }
    console.error(err);
    return Response.json({ error: 'Dispatch failed. No slots were changed.' }, { status: 500 });
  }
}

export async function DELETE(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Request body must be JSON.' }, { status: 400 });
  }

  const blockId = Number(body.blockId);
  const eventId = Number(body.eventId);

  if (!Number.isInteger(blockId) || blockId < 1 || !Number.isInteger(eventId) || eventId < 1) {
    return Response.json({ error: 'A valid block and event are required.' }, { status: 400 });
  }

  try {
    const deleted = await withTransaction(async (client) => {
      const result = await client.query(
        `DELETE FROM dispatch_events
          WHERE id = $1 AND block_id = $2
          RETURNING id`,
        [eventId, blockId]
      );

      if (result.rowCount === 0) {
        throw new RuleError('That dispatch record does not exist.');
      }

      return result.rows[0];
    });

    return Response.json({ deleted: deleted.id });
  } catch (err) {
    if (err instanceof RuleError) {
      return Response.json({ error: err.message }, { status: 404 });
    }
    console.error(err);
    return Response.json({ error: 'Could not delete the dispatch record.' }, { status: 500 });
  }
}

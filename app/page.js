'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

const operators = ['Alpha', 'Bravo', 'Charlie'];

export default function Console() {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState(null);
  const [note, setNote] = useState(null);
  const [changed, setChanged] = useState([]);
  const [mapError, setMapError] = useState(null);
  const [mapsReady, setMapsReady] = useState(false);

  const [dispatchQty, setDispatchQty] = useState(6);
  const [loadQty, setLoadQty] = useState(6);
  const [operator, setOperator] = useState(operators[0]);
  const [selectedSlots, setSelectedSlots] = useState([]);
  const [positionId, setPositionId] = useState(null);
  const [mapMode, setMapMode] = useState('target');
  const [launchPoint, setLaunchPoint] = useState(null);
  const [targetPoint, setTargetPoint] = useState(null);
  const [draftTarget, setDraftTarget] = useState(null);

  // The Map is built once and kept here. Rebuilding it on every coordinate
  // change would reset the operator's pan and zoom mid-interaction.
  const mapRef = useRef(null);
  const markersRef = useRef({ launch: null, target: null });
  // Read inside the map click handler, which is registered once and so would
  // otherwise capture the mode from first render forever.
  const mapModeRef = useRef('target');

  const mapApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';

  const blockId = state?.block?.id;
  const busy = busyAction !== null;

  const refresh = useCallback(async () => {
    const res = await fetch('/api/state');
    const data = await res.json();
    setState(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Default to the first position once state arrives, and drop the selection if
  // that position later goes inactive.
  useEffect(() => {
    const available = state?.positions;
    if (!available?.length) return;
    setPositionId((current) =>
      current && available.some((p) => p.id === current) ? current : available[0].id
    );
  }, [state?.positions]);

  async function send(path, payload, describe, action) {
    setBusyAction(action);
    setNote(null);
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        setNote({ bad: true, text: data.error || 'The request was rejected.' });
      } else {
        setChanged(data.released || data.filled || []);
        setSelectedSlots([]);
        setNote({ bad: false, text: describe(data) });
        await refresh();
        setTimeout(() => setChanged([]), 900);
      }
    } catch {
      setNote({ bad: true, text: 'Could not reach the server.' });
    } finally {
      setBusyAction(null);
    }
  }

  async function runSetup() {
    setBusyAction('setup');
    try {
      const res = await fetch('/api/setup', { method: 'POST' });
      const data = await res.json();
      if (data.error) {
        setNote({ bad: true, text: data.error });
      } else {
        await refresh();
      }
    } catch {
      setNote({ bad: true, text: 'Could not reach the server.' });
    } finally {
      setBusyAction(null);
    }
  }

  async function deleteEvent(eventId) {
    if (!window.confirm('Delete this dispatch record?')) return;

    setBusyAction('delete');
    setNote(null);
    try {
      const res = await fetch('/api/dispatch', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blockId, eventId }),
      });
      const data = await res.json();

      if (!res.ok) {
        setNote({ bad: true, text: data.error || 'Could not delete the dispatch record.' });
      } else {
        setNote({ bad: false, text: 'Dispatch record deleted.' });
        await refresh();
      }
    } catch {
      setNote({ bad: true, text: 'Could not reach the server.' });
    } finally {
      setBusyAction(null);
    }
  }

  function toggleSlotSelection(slotNumber) {
    if (!state?.block || busy) return;
    setSelectedSlots((current) => {
      const hasSlot = current.includes(slotNumber);
      return hasSlot
        ? current.filter((n) => n !== slotNumber)
        : [...current, slotNumber].sort((a, b) => a - b);
    });
  }

  function setLaunchFromDevice() {
    if (!navigator.geolocation) {
      setNote({ bad: true, text: 'This browser does not provide your current location.' });
      return;
    }

    setNote(null);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLaunchPoint({ lat: coords.latitude, lng: coords.longitude });
        setNote({ bad: false, text: 'Launch position set from your current location.' });
      },
      () => setNote({ bad: true, text: 'Could not read your location. Allow location access and try again.' }),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  // Depend on the coordinate values, not on state.target itself: every
  // /api/state fetch returns a fresh object, so an identity dependency re-ran
  // this after each dispatch and threw away an unsaved draft.
  const savedLat = state?.target ? Number(state.target.latitude) : null;
  const savedLng = state?.target ? Number(state.target.longitude) : null;

  useEffect(() => {
    setTargetPoint(savedLat !== null && savedLng !== null ? { lat: savedLat, lng: savedLng } : null);
  }, [savedLat, savedLng]);

  const saveTarget = useCallback(async () => {
    if (!draftTarget || !state?.block?.id) return;

    setBusyAction('save-target');
    try {
      const res = await fetch('/api/target', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blockId: state.block.id,
          latitude: draftTarget.lat,
          longitude: draftTarget.lng,
          label: 'Target',
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setNote({ bad: true, text: data.error || 'Could not save target.' });
        return;
      }

      setTargetPoint({ lat: draftTarget.lat, lng: draftTarget.lng });
      setDraftTarget(null);
      setNote({ bad: false, text: 'Target saved successfully.' });
      await refresh();
    } catch {
      setNote({ bad: true, text: 'Could not save target location.' });
    } finally {
      setBusyAction(null);
    }
  }, [draftTarget, refresh, state?.block?.id]);

  const clearTarget = useCallback(async () => {
    if (!state?.block?.id || !targetPoint) return;

    setBusyAction('clear-target');
    try {
      const res = await fetch('/api/target', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blockId: state.block.id }),
      });
      const data = await res.json();

      if (!res.ok) {
        setNote({ bad: true, text: data.error || 'Could not clear target.' });
        return;
      }

      setTargetPoint(null);
      setNote({ bad: false, text: 'Saved target cleared.' });
      await refresh();
    } catch {
      setNote({ bad: true, text: 'Could not clear target location.' });
    } finally {
      setBusyAction(null);
    }
  }, [refresh, state?.block?.id, targetPoint]);

  useEffect(() => {
    mapModeRef.current = mapMode;
  }, [mapMode]);

  // Build the map once, the first time the API and a position to centre on are
  // both available. Markers are handled separately, below.
  useEffect(() => {
    if (!mapsReady || mapRef.current) return;
    if (!state?.positions?.length) return;

    const mapNode = document.getElementById('google-map');
    if (!mapNode) return;

    const base = state.positions[0];

    mapRef.current = new window.google.maps.Map(mapNode, {
      center: { lat: Number(base.latitude), lng: Number(base.longitude) },
      zoom: 11,
      mapTypeControl: false,
      streetViewControl: false,
    });

    mapRef.current.addListener('click', (event) => {
      const point = { lat: event.latLng.lat(), lng: event.latLng.lng() };
      if (mapModeRef.current === 'launch') {
        setLaunchPoint(point);
        setNote({ bad: false, text: 'Launch position set from the map.' });
      } else {
        setDraftTarget(point);
      }
    });
  }, [mapsReady, state?.positions]);

  // Move or create markers in place on the existing map.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const markers = markersRef.current;

    if (launchPoint) {
      if (markers.launch) {
        markers.launch.setPosition(launchPoint);
      } else {
        markers.launch = new window.google.maps.Marker({
          position: launchPoint,
          map,
          title: 'Current launch position',
          icon: 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png',
        });
      }
    } else if (markers.launch) {
      markers.launch.setMap(null);
      markers.launch = null;
    }

    const visibleTarget = draftTarget || targetPoint;
    if (visibleTarget) {
      const icon = draftTarget
        ? 'https://maps.google.com/mapfiles/ms/icons/yellow-dot.png'
        : 'https://maps.google.com/mapfiles/ms/icons/green-dot.png';
      const title = draftTarget ? 'Pending target' : 'Target';

      if (markers.target) {
        markers.target.setPosition(visibleTarget);
        markers.target.setIcon(icon);
        markers.target.setTitle(title);
      } else {
        markers.target = new window.google.maps.Marker({
          position: visibleTarget,
          map,
          title,
          icon,
        });
      }
    } else if (markers.target) {
      markers.target.setMap(null);
      markers.target = null;
    }
  }, [mapsReady, targetPoint, draftTarget, launchPoint]);

  useEffect(() => {
    if (!mapApiKey || typeof document === 'undefined') return;

    if (window.google?.maps) {
      setMapsReady(true);
      return undefined;
    }

    window.gm_authFailure = () => {
      setMapError('Google Maps rejected the API key. Check Maps JavaScript API, billing, and localhost restrictions.');
    };

    const existing = document.getElementById('google-maps-script');
    if (existing) {
      // A script tag from an earlier mount is still loading; wait for it rather
      // than adding a second one.
      existing.addEventListener('load', () => setMapsReady(true));
      return undefined;
    }

    const script = document.createElement('script');
    script.id = 'google-maps-script';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${mapApiKey}`;
    script.async = true;
    script.defer = true;
    // Without this the map effect never re-runs once the API finishes loading.
    script.onload = () => setMapsReady(true);
    script.onerror = () => {
      setMapError('Google Maps could not load. Check the API key and network connection.');
    };
    document.body.appendChild(script);

    return () => {
      if (window.gm_authFailure) delete window.gm_authFailure;
    };
  }, [mapApiKey]);

  if (loading) {
    return <main className="shell"><p>Reading block state…</p></main>;
  }

  if (state?.error) {
    return (
      <main className="shell">
        <div className="setup">
          <h1>Database not reachable</h1>
          <p>{state.error}</p>
        </div>
      </main>
    );
  }

  if (!state?.ready) {
    return (
      <main className="shell">
        <div className="setup">
          <h1>No block on record</h1>
          <p>
            Create the tables and seed one block of 24 slots, all filled. You can
            run this once, now.
          </p>
          <button className="action" onClick={runSetup} disabled={busy}>
            {busy ? 'Setting up…' : 'Set up the database'}
          </button>
          {note && <div className={`note ${note.bad ? 'bad' : ''}`}>{note.text}</div>}
        </div>
      </main>
    );
  }

  // `positions` is intentionally not destructured: the site list no longer
  // appears in the UI. It is still read by the map effects via state.positions,
  // and positionId is auto-assigned to satisfy dispatch_events.position_id.
  const { block, slots, events } = state;
  const pct = (block.occupied / block.capacity) * 100;
  const freeSlotsAvailable = Number(block.available || 0);
  const activeTarget = draftTarget || targetPoint;

  // Why dispatch is unavailable, in the order the operator should act on it.
  // A disabled button with no stated reason is a dead end.
  const dispatchCount = selectedSlots.length > 0 ? selectedSlots.length : Number(dispatchQty);
  const blockedBecause = busy
    ? null
    : !launchPoint
      ? 'Set a launch position to dispatch.'
      : !activeTarget
        ? 'Set a target on the map to dispatch.'
        : block.occupied === 0
          ? 'Every slot is empty. Load before dispatching.'
          : !(dispatchCount >= 1)
            ? 'Enter how many to dispatch.'
            : dispatchCount > block.occupied
              ? `Only ${block.occupied} held, but ${dispatchCount} requested.`
              : null;

  return (
    <main className="shell">
      <header className="masthead">
        <h1>{block.name}</h1>
        <div className="masthead-end">
          <span className="sub">
            Slot occupancy and dispatch record · updated live
          </span>
          <Link href="/mine" className="navlink">
            SD time →
          </Link>
        </div>
      </header>

      <div className="columns">
        <section>
          <div className="readout">
            <span className="figure">{block.available}</span>
            <span className="of">
              slots free
              <br />
              of {block.capacity}
            </span>
          </div>

          <div
            className="gauge"
            role="progressbar"
            aria-valuenow={block.occupied}
            aria-valuemin={0}
            aria-valuemax={block.capacity}
            aria-label={`${block.occupied} of ${block.capacity} slots held`}
          >
            <span style={{ width: `${pct}%` }} />
          </div>
          {/* The bar fills with what is held, while the figure above counts
              what is free — say so, or the two readings look contradictory. */}
          <div className="gauge-key">
            <span>{block.occupied} held</span>
            <span>{block.available} free</span>
          </div>

          <div className="grid">
            {slots.map((slot) => (
              <div
                key={slot.slot_number}
                className={[
                  'cell',
                  slot.status === 'occupied' ? 'occupied' : '',
                  selectedSlots.includes(slot.slot_number) ? 'selected' : '',
                  changed.includes(slot.slot_number) ? 'changed' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                title={
                  slot.status === 'occupied'
                    ? `Click to select slot ${slot.slot_number}`
                    : `Slot ${slot.slot_number}, empty`
                }
                onClick={() => slot.status === 'occupied' && toggleSlotSelection(slot.slot_number)}
                role="button"
                tabIndex={slot.status === 'occupied' ? 0 : -1}
                onKeyDown={(e) => {
                  if ((e.key === 'Enter' || e.key === ' ') && slot.status === 'occupied') {
                    e.preventDefault();
                    toggleSlotSelection(slot.slot_number);
                  }
                }}
              >
                {slot.slot_number}
              </div>
            ))}
          </div>

          <div className="legend">
            <span><i className="full" />Held</span>
            <span><i />Free</span>
            {selectedSlots.length > 0 && (
              <span><i className="selected" />Selected ({selectedSlots.length})</span>
            )}
          </div>
        </section>

        <aside>
          <div className="panel">
            <h2>Dispatch</h2>

            <div className="field">
              <label>Map click sets</label>
              <div className="mode-row">
                <button
                  type="button"
                  className={`mode ${mapMode === 'launch' ? 'on' : ''}`}
                  aria-pressed={mapMode === 'launch'}
                  onClick={() => setMapMode('launch')}
                >
                  Launch
                </button>
                <button
                  type="button"
                  className={`mode ${mapMode === 'target' ? 'on' : ''}`}
                  aria-pressed={mapMode === 'target'}
                  onClick={() => setMapMode('target')}
                >
                  Target
                </button>
                <button
                  type="button"
                  className="mode gps"
                  onClick={setLaunchFromDevice}
                  title="Set the launch position from this device's location"
                >
                  Use my location
                </button>
              </div>

              {mapApiKey ? (
                <div>
                  {mapError ? (
                    <div className="note bad">{mapError}</div>
                  ) : (
                    <div id="google-map" className="map-canvas" />
                  )}
                  <div className="hint">
                    {launchPoint
                      ? `Launch: ${launchPoint.lat.toFixed(5)}, ${launchPoint.lng.toFixed(5)}`
                      : 'No launch position set.'}
                    {mapMode === 'launch'
                      ? ' Click the map to set the launch position.'
                      : ' Click the map to set the target.'}
                  </div>
                  <div className="target-box">
                    <div className="target-box-title">Saved target</div>
                    {draftTarget ? (
                      <>
                        <div className="target-coordinates draft">
                          Draft: {draftTarget.lat.toFixed(5)}, {draftTarget.lng.toFixed(5)}
                        </div>
                        <button
                          type="button"
                          className="action target-save"
                          onClick={saveTarget}
                          disabled={busy}
                        >
                          {busyAction === 'save-target' ? 'Saving target…' : 'Save target'}
                        </button>
                      </>
                    ) : targetPoint ? (
                      <>
                        <div className="target-coordinates">
                          {targetPoint.lat.toFixed(5)}, {targetPoint.lng.toFixed(5)}
                        </div>
                        <div className="target-time">
                          {state?.target?.updated_at
                            ? `Saved ${new Date(state.target.updated_at).toLocaleString()}`
                            : 'Saved target'}
                        </div>
                        <button
                          type="button"
                          className="action quiet target-clear"
                          onClick={clearTarget}
                          disabled={busy}
                        >
                          {busyAction === 'clear-target' ? 'Clearing target…' : 'Clear target'}
                        </button>
                      </>
                    ) : (
                      <div className="target-empty">No target saved yet.</div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="hint">
                  Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to enable map selection.
                </div>
              )}
            </div>

            <div className="field">
              <label htmlFor="dqty">How many</label>
              <input
                id="dqty"
                type="number"
                min="1"
                max={block.capacity}
                value={selectedSlots.length > 0 ? selectedSlots.length : dispatchQty}
                onChange={(e) => setDispatchQty(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="op">Operator</label>
              <select
                id="op"
                value={operator}
                onChange={(e) => setOperator(e.target.value)}
              >
                {operators.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            <button
              className="action"
              disabled={busy || blockedBecause !== null}
              onClick={async () => {
                // Dispatching an unsaved draft promotes it to the saved target
                // first, so the pin left on screen is the one the next dispatch
                // will actually use.
                if (draftTarget) await saveTarget();

                const payload = {
                  blockId: block.id,
                  positionId,
                  launchLatitude: launchPoint.lat,
                  launchLongitude: launchPoint.lng,
                  targetLatitude: activeTarget.lat,
                  targetLongitude: activeTarget.lng,
                  quantity: dispatchCount,
                  operator,
                  selectedSlots: selectedSlots.length > 0 ? selectedSlots : undefined,
                };

                send(
                  '/api/dispatch',
                  payload,
                  (d) => `Dispatched ${d.quantity}. Slots ${d.released.join(', ')} are now free.`,
                  'dispatch'
                );
              }}
            >
              {busyAction === 'dispatch'
                ? 'Dispatching missiles…'
                : selectedSlots.length > 0
                  ? `Dispatch ${selectedSlots.length}`
                  : 'Dispatch'}
            </button>

            {blockedBecause && <div className="hint blocked">{blockedBecause}</div>}
          </div>

          <div className="panel">
            <h2>Load slots</h2>

            <div className="field">
              <label htmlFor="lqty">How many ({freeSlotsAvailable} available)</label>
              <input
                id="lqty"
                type="number"
                min="1"
                max={freeSlotsAvailable}
                value={Math.min(Number(loadQty) || 1, freeSlotsAvailable || 1)}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  if (Number.isNaN(next)) {
                    setLoadQty(0);
                    return;
                  }
                  setLoadQty(Math.max(1, Math.min(next, freeSlotsAvailable || 1)));
                }}
              />
              <div className="hint tight">
                {freeSlotsAvailable} slot{freeSlotsAvailable === 1 ? '' : 's'} available to load
              </div>
            </div>

            <button
              className="action quiet"
              disabled={busy || freeSlotsAvailable === 0}
              onClick={() =>
                send(
                  '/api/load',
                  { blockId: block.id, quantity: Math.min(Number(loadQty) || 0, freeSlotsAvailable), operator },
                  (d) => `Filled slots ${d.filled.join(', ')}.`,
                  'load'
                )
              }
            >
              {busyAction === 'load'
                ? 'Loading missiles…'
                : `Load ${freeSlotsAvailable === 0 ? 0 : Math.min(Number(loadQty) || 1, freeSlotsAvailable)}`}
            </button>
          </div>

          {note && (
            <div className={`note ${note.bad ? 'bad' : ''}`}>{note.text}</div>
          )}
        </aside>
      </div>

      <section className="log">
        <h2>Dispatch record</h2>
        {events.length === 0 ? (
          <p className="empty">Nothing dispatched yet. The first dispatch will appear here.</p>
        ) : (
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Time</th>
                  <th>Launch position</th>
                  <th>Target position</th>
                  <th>Quantity</th>
                  <th>Slots released</th>
                  <th>Operator</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id}>
                    <td className="num" data-label="Event">{e.id}</td>
                    <td className="num" data-label="Time">{new Date(e.occurred_at).toLocaleString()}</td>
                    <td className="num" data-label="Launch">{e.launch_latitude != null ? `${Number(e.launch_latitude).toFixed(5)}, ${Number(e.launch_longitude).toFixed(5)}` : '—'}</td>
                    <td className="num" data-label="Target">{e.target_latitude != null ? `${Number(e.target_latitude).toFixed(5)}, ${Number(e.target_longitude).toFixed(5)}` : '—'}</td>
                    <td className="num" data-label="Quantity">{e.quantity}</td>
                    <td className="num" data-label="Slots released">{e.slots}</td>
                    <td data-label="Operator">{e.operator}</td>
                    <td data-label="">
                      <button
                        type="button"
                        className="delete-record"
                        onClick={() => deleteEvent(e.id)}
                        disabled={busy}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

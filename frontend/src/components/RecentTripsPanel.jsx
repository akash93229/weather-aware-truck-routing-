import React, { useState, useEffect } from 'react';
import { getRecentTrips, deleteRecentTrip, clearRecentTrips } from '../api/client';
import { Card, Badge, EmptyState, Button, IconButton } from '../ui/components';
import { Icon } from '../ui/icons';

function formatRelativeTime(dateIso) {
  if (!dateIso) return '';
  const now = Date.now();
  const past = new Date(dateIso).getTime();
  const diffSec = Math.floor((now - past) / 1000);

  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

export default function RecentTripsPanel({
  onSelectTrip,
  onClose,
  refreshKey = 0,
}) {
  const [trips, setTrips] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const loadTrips = () => {
    setIsLoading(true);
    getRecentTrips(10)
      .then((data) => {
        setTrips(data || []);
        setIsLoading(false);
      })
      .catch(() => {
        setIsLoading(false);
      });
  };

  useEffect(() => {
    loadTrips();
  }, [refreshKey]);

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    const success = await deleteRecentTrip(id);
    if (success) {
      setTrips((prev) => prev.filter((t) => t.id !== id));
    }
  };

  const handleClearAll = async () => {
    const success = await clearRecentTrips();
    if (success) {
      setTrips([]);
      setShowClearConfirm(false);
    }
  };

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16 }}>
        <div className="sl-skeleton" style={{ height: 72, borderRadius: 14 }} />
        <div className="sl-skeleton" style={{ height: 72, borderRadius: 14 }} />
      </div>
    );
  }

  if (trips.length === 0) {
    return (
      <div style={{ padding: 24 }}>
        <EmptyState
          icon="clock"
          title="No Recent Trips"
          description="Analyzed routes and weather briefs will automatically appear here for one-click re-runs."
        />
      </div>
    );
  }

  return (
    <div className="recent-trips-container" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 4 }}>
        <span style={{ fontSize: 'var(--font-xs)', fontWeight: 'var(--weight-semibold)', color: 'var(--text-muted)' }}>
          {trips.length} recent search{trips.length > 1 ? 'es' : ''}
        </span>
        {!showClearConfirm ? (
          <Button variant="ghost" size="sm" onClick={() => setShowClearConfirm(true)}>
            Clear all
          </Button>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>Confirm?</span>
            <Button variant="secondary" size="sm" onClick={handleClearAll}>Yes</Button>
            <Button variant="ghost" size="sm" onClick={() => setShowClearConfirm(false)}>Cancel</Button>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {trips.map((trip) => (
          <Card
            key={trip.id}
            interactive
            className="recent-trip-card"
            onClick={() => onSelectTrip(trip)}
            style={{ padding: '12px 14px' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
                <span style={{ fontWeight: 'var(--weight-bold)', fontSize: 'var(--font-sm)', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>
                  {trip.origin_label}
                </span>
                <span style={{ color: 'var(--text-muted)', fontSize: 'var(--font-xs)' }}>→</span>
                <span style={{ fontWeight: 'var(--weight-bold)', fontSize: 'var(--font-sm)', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>
                  {trip.dest_label}
                </span>
              </div>
              <Badge riskLevel={trip.max_risk_level ?? 0} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
              <span style={{ fontSize: 'var(--font-xs)', color: 'var(--text-muted)' }}>
                {formatRelativeTime(trip.created_at)}
              </span>

              <div className="recent-trip-actions" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectTrip(trip);
                  }}
                  icon={<Icon name="route" size={12} />}
                >
                  Re-run
                </Button>
                <IconButton
                  icon={<Icon name="close" size={14} />}
                  ariaLabel="Delete trip"
                  title="Delete trip"
                  onClick={(e) => handleDelete(e, trip.id)}
                  style={{ width: 32, height: 32, minWidth: 32, minHeight: 32 }}
                />
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

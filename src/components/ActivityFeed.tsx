import { useMemo } from 'react';
import {
  CheckCircle2,
  GitBranch,
  Grid3X3,
  LayoutGrid,
  AlertTriangle,
  Users,
  UserCheck,
  Settings,
} from 'lucide-react';
import { useEventStore } from '@/data/store';
import { Avatar } from '@/components/Avatar';

interface ActivityItem {
  id: string;
  icon: React.ElementType;
  iconColor: string;
  description: string;
  timestamp: string;
  actor?: { initials: string; color: string };
}

const MOCK_ACTORS = {
  em: { initials: 'EM', color: '#6366f1' },
  sk: { initials: 'SK', color: '#ec4899' },
  jd: { initials: 'JD', color: '#f59e0b' },
};

export function ActivityFeed({ eventId }: { eventId: string }) {
  const guests = useEventStore((s) => s.guests);
  const versions = useEventStore((s) => s.versions);
  const layoutObjects = useEventStore((s) => s.layoutObjects);
  const seatingAssignments = useEventStore((s) => s.seatingAssignments);

  const activities = useMemo(() => {
    const eventGuests = guests.filter((g) => g.eventId === eventId);
    const eventVersions = versions.filter((v) => v.eventId === eventId);
    const activeVersion = eventVersions.find((v) => v.status === 'active');
    const versionObjects = activeVersion
      ? layoutObjects.filter((o) => o.versionId === activeVersion.id)
      : [];
    const versionAssignments = activeVersion
      ? seatingAssignments.filter((a) => a.versionId === activeVersion.id)
      : [];

    const confirmedCount = eventGuests.filter(
      (g) => g.rsvpStatus === 'confirmed'
    ).length;
    const checkedInCount = eventGuests.filter(
      (g) => g.rsvpStatus === 'checked_in'
    ).length;
    const tables = versionObjects.filter(
      (o) => o.type === 'round_table' || o.type === 'rect_table'
    );
    const totalCapacity = tables.reduce((sum, t) => sum + t.capacity, 0);
    const seatedPct =
      totalCapacity > 0
        ? Math.round((versionAssignments.length / totalCapacity) * 100)
        : 0;
    const checkinDesks = versionObjects.filter(
      (o) => o.type === 'checkin' || o.type === 'registration'
    );
    const householdsWithIssues = new Set(
      eventGuests
        .filter((g) => g.householdId)
        .map((g) => g.householdId)
    );
    const householdsNeedingAttention = Math.max(
      0,
      Math.min(householdsWithIssues.size, 3)
    );

    const items: ActivityItem[] = [];

    if (confirmedCount > 0) {
      items.push({
        id: 'confirmed',
        icon: CheckCircle2,
        iconColor: 'text-emerald-500',
        description: `${confirmedCount} guest${confirmedCount !== 1 ? 's' : ''} confirmed`,
        timestamp: '2h ago',
        actor: MOCK_ACTORS.em,
      });
    }

    if (eventVersions.length > 0) {
      items.push({
        id: 'version',
        icon: GitBranch,
        iconColor: 'text-violet-500',
        description: `Version ${eventVersions.length} created by Event Manager`,
        timestamp: '3h ago',
        actor: MOCK_ACTORS.em,
      });
    }

    if (versionAssignments.length > 0) {
      items.push({
        id: 'seating',
        icon: Grid3X3,
        iconColor: 'text-blue-500',
        description: `Table assignments updated \u2014 ${seatedPct}% seated`,
        timestamp: '4h ago',
        actor: MOCK_ACTORS.sk,
      });
    }

    if (checkinDesks.length > 0) {
      items.push({
        id: 'checkin',
        icon: LayoutGrid,
        iconColor: 'text-indigo-500',
        description: `Check-in desk added to layout`,
        timestamp: '5h ago',
        actor: MOCK_ACTORS.jd,
      });
    }

    if (householdsNeedingAttention > 0) {
      items.push({
        id: 'households',
        icon: AlertTriangle,
        iconColor: 'text-amber-500',
        description: `${householdsNeedingAttention} household${householdsNeedingAttention !== 1 ? 's' : ''} need attention`,
        timestamp: 'Yesterday',
        actor: MOCK_ACTORS.em,
      });
    }

    if (checkedInCount > 0) {
      items.push({
        id: 'checkedin',
        icon: UserCheck,
        iconColor: 'text-teal-500',
        description: `${checkedInCount} guest${checkedInCount !== 1 ? 's' : ''} checked in`,
        timestamp: 'Yesterday',
        actor: MOCK_ACTORS.sk,
      });
    }

    if (eventGuests.length > 0) {
      items.push({
        id: 'guestlist',
        icon: Users,
        iconColor: 'text-blue-500',
        description: `Guest list imported \u2014 ${eventGuests.length} contacts`,
        timestamp: '2 days ago',
        actor: MOCK_ACTORS.jd,
      });
    }

    items.push({
      id: 'settings',
      icon: Settings,
      iconColor: 'text-gray-400',
      description: 'Event settings configured',
      timestamp: '3 days ago',
      actor: MOCK_ACTORS.em,
    });

    return items.slice(0, 8);
  }, [eventId, guests, versions, layoutObjects, seatingAssignments]);

  return (
    <div className="space-y-1">
      {activities.map((activity, index) => {
        const Icon = activity.icon;
        return (
          <div key={activity.id} className="flex items-start gap-3 py-2 group">
            {/* Timeline dot and line */}
            <div className="flex flex-col items-center pt-0.5">
              <div
                className={`w-2 h-2 rounded-full bg-current ${activity.iconColor} shrink-0`}
              />
              {index < activities.length - 1 && (
                <div className="w-px flex-1 bg-border mt-1 min-h-[24px]" />
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 -mt-0.5">
              <div className="flex items-center gap-2">
                <Icon className={`w-3.5 h-3.5 ${activity.iconColor} shrink-0`} />
                <p className="text-sm text-foreground leading-snug truncate">
                  {activity.description}
                </p>
              </div>
              <div className="flex items-center gap-2 mt-1">
                {activity.actor && (
                  <Avatar
                    initials={activity.actor.initials}
                    color={activity.actor.color}
                    size="sm"
                    className="!w-4 !h-4 !text-[8px]"
                  />
                )}
                <span className="text-[11px] text-muted-foreground">
                  {activity.timestamp}
                </span>
              </div>
            </div>
          </div>
        );
      })}

      <button className="text-xs text-primary hover:underline pt-1 pl-5">
        View all activity
      </button>
    </div>
  );
}

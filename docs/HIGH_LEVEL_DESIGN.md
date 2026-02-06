# FiFi Alert - High Level Design Document

> **Version:** 1.0  
> **Date:** February 2026  
> **Status:** Draft  
> **Purpose:** Foundation document for technical specification and implementation

---

## 1. Executive Summary

FiFi Alert is a mobile application that enables communities to help locate missing pets through location-aware push notifications. When a pet goes missing, the system notifies only users who are geographically relevant—those currently near the event or who have expressed interest in specific areas.

### Core Value Proposition

- **For pet owners:** Rapid community mobilization when a pet goes missing
- **For helpers:** Relevant, actionable alerts without notification fatigue
- **For communities:** A network effect where more users means faster pet recovery

---

## 2. Problem Statement

### Current Challenges

1. **Information doesn't reach the right people** — Social media posts and flyers don't target people actually in the area
2. **Notification fatigue** — Broadcast-to-all approaches lead to users ignoring or unsubscribing
3. **Time sensitivity** — The first 24-48 hours are critical for finding lost pets
4. **Location accuracy** — Mobile apps can't reliably track user locations without significant friction

### Our Approach

Target notifications based on **relevance**, not reach. A user 50km away doesn't need to know about a missing cat. A user 2km away might spot it on their evening walk.

---

## 3. Non-Goals (Explicit)

The following are **intentionally out of scope**. These are not limitations to fix later—they are deliberate design decisions.

| Non-Goal | Rationale |
|----------|-----------|
| **Guarantee notification delivery** | Push notifications are inherently unreliable (device off, permissions revoked, OS throttling). We optimize for best-effort delivery, not guarantees. |
| **Track users continuously** | Continuous GPS tracking destroys battery life and user trust. We use periodic updates and user-defined zones instead. |
| **Notify all users** | Relevance over completeness. A user 100km away adds no value and will eventually unsubscribe. We intentionally limit reach. |
| **Include users with stale/low-confidence location** | Users with week-old location data may have moved cities. Notifying them wastes their attention and our credibility. |
| **Replace professional pet recovery services** | We're a community awareness tool, not a substitute for microchipping, professional trackers, or law enforcement. |
| **Provide real-time location sharing** | We don't show live user locations. Privacy is non-negotiable. |

### Why This Matters

These explicit non-goals:

1. **Prevent scope creep** — When someone asks "why can't we just notify everyone?", point here
2. **Set stakeholder expectations** — Alert creators understand they won't reach 100% of users
3. **Protect engineering decisions** — Gives cover for intentional exclusions
4. **Guide trade-off decisions** — When choosing between reach and relevance, choose relevance

> **Design Principle:** It's better to notify 100 relevant users than 10,000 irrelevant ones. The latter creates notification fatigue and kills the product.

---

## 4. User Promise & Expectations Contract

This section defines **what we promise to users** in plain language—not algorithms or technical behavior, but the human-readable commitment we're making.

### 4.1 The Core Promise

**To alert recipients:**
> "We will try to notify you about missing pets in areas you care about. We prioritize sending you relevant alerts over sending you every alert."

**To alert creators:**
> "We will notify people who are likely nearby or have expressed interest in your area. We cannot guarantee everyone will be notified, but we will reach the people most likely to help."

### 4.2 What We Promise

| Promise | What This Means |
|---------|-----------------|
| **Relevant notifications** | We will not spam you with alerts from far away. If you get a notification, there's a reasonable chance you could help. |
| **Respect your preferences** | If you tell us where you want alerts, we'll honor that. If you mute something, it stays muted. |
| **Transparency** | If you didn't get a notification, we can tell you why. No silent, unexplained exclusions. |
| **Privacy by default** | Your location is used to help you, not to track you. We don't share your exact position with anyone. |
| **Best effort delivery** | We will send notifications promptly, but delivery depends on your device and network. |

### 4.3 What We Explicitly Do NOT Promise

| Not Promised | Why |
|--------------|-----|
| **100% notification delivery** | Push notifications are unreliable by nature. Devices may be off, in airplane mode, or have notifications disabled. |
| **Reaching everyone in the area** | We don't know everyone's location. Users with stale or missing location data may not receive alerts. |
| **Real-time location accuracy** | Location data may be hours old. We compensate with expanded search areas, but cannot guarantee precision. |
| **Finding the pet** | We connect communities; we don't guarantee outcomes. Success depends on many factors beyond our control. |
| **Notifying non-users** | We can only reach people who have installed the app and enabled notifications. |

### 4.4 The Accuracy vs. Completeness Trade-off

We have made a deliberate product decision:

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   ACCURACY (relevance)           vs.        COMPLETENESS        │
│   "Right people get notified"               "Everyone notified" │
│                                                                 │
│              ✅ WE CHOOSE THIS                    ❌             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Why accuracy wins:**

1. **Notification fatigue is fatal** — Users who receive irrelevant alerts will disable notifications or uninstall
2. **Trust requires relevance** — Each irrelevant notification erodes trust in future alerts
3. **Quality over quantity** — 50 engaged local helpers > 5,000 annoyed distant users
4. **Sustainable ecosystem** — A smaller, engaged user base beats a large, disengaged one

### 4.5 Setting Expectations in the Product

These promises must be communicated to users at key moments:

| Moment | Message |
|--------|---------|
| **Onboarding** | "We'll notify you about missing pets in your area. The more location info you share, the more relevant your alerts will be." |
| **Creating an alert** | "We'll notify people who are likely nearby. This won't reach everyone, but it will reach people who can help." |
| **Notification received** | "This pet was last seen near an area you care about." |
| **Alert not received** | "You weren't notified because [specific reason]. Here's how to improve your coverage." |
| **Settings page** | "Your alert coverage: [status]. You're currently receiving alerts for [X areas]." |

### 4.6 Support & Communication Implications

When users complain "I didn't get notified and I live right there!", support should:

1. **Acknowledge the frustration** — "We understand how important this is"
2. **Explain honestly** — "Our records show [specific reason]"
3. **Offer improvement** — "Here's how to ensure you get alerts next time"
4. **Never promise perfection** — Avoid implying we can guarantee coverage

> **Principle:** Under-promise and over-deliver. Users who expect "best effort" and get it are satisfied. Users who expect "guarantee" and don't get it are angry—even if the outcome is identical.

---

## 5. Anticipated Abuse & Failure Scenarios

This section documents **known product risks** that must be addressed before or during implementation. These are not edge cases—they are predictable abuse patterns that will occur at scale.

### 5.1 Alert Abuse

| Scenario | Description | Impact | Severity |
|----------|-------------|--------|----------|
| **False alerts** | User creates alert for a pet that isn't missing (prank, test, attention-seeking) | Wastes community attention, erodes trust | High |
| **Malicious targeting** | Alert created to harass someone (e.g., "found at [victim's address]") | Legal liability, user safety | Critical |
| **Spam flooding** | Bad actor creates many alerts in dense area to disrupt service | Notification fatigue, mass unsubscribes | High |
| **Fake resolution** | Competitor/troll marks others' alerts as "found" | Stops legitimate search efforts | Medium |
| **Duplicate alerts** | Same pet reported multiple times (by family members, or for attention refresh) | Notification spam, data pollution | Medium |
| **Prohibited content** | Inappropriate images, hate speech in descriptions | Legal/policy violation, app store removal | Critical |

### 5.2 Sighting Abuse

| Scenario | Description | Impact | Severity |
|----------|-------------|--------|----------|
| **False sightings** | Fake reports to troll pet owner or get attention | Emotional harm, wasted search effort | High |
| **Location pranks** | Reporting sightings in impossible locations (ocean, airport) | Owner sent on wild goose chase | Medium |
| **Sighting spam** | Flooding an alert with junk sightings | Buries legitimate reports | Medium |
| **Extortion setup** | "I found your pet, meet me at [location]" with malicious intent | User safety risk | Critical |

### 5.3 System Gaming

| Scenario | Description | Impact | Severity |
|----------|-------------|--------|----------|
| **Location spoofing** | Faking GPS to receive alerts in other areas | Irrelevant notifications, data pollution | Low |
| **Notification farming** | Creating alerts to test/abuse push notification limits | Infrastructure cost, rate limit gaming | Low |
| **Scraping** | Harvesting pet/owner data for other purposes | Privacy violation | Medium |
| **Account farming** | Creating multiple accounts to bypass rate limits | Amplifies other abuse | Medium |

### 5.4 Failure Scenarios (Non-Malicious)

| Scenario | Description | Impact | Severity |
|----------|-------------|--------|----------|
| **Wrong location** | Owner enters incorrect last-seen location | Wrong people notified, right people missed | High |
| **Stale alert** | Pet found but owner forgets to close alert | Continued unnecessary notifications | Medium |
| **Deceased pet** | Pet found deceased; owner doesn't want to share | Awkward UX, emotional harm | Medium |
| **Found but not by app** | Pet returns home; owner never updates | Alert stays active unnecessarily | Medium |
| **Notification overload** | Dense urban area with many missing pets | Users overwhelmed, unsubscribe | High |
| **Cross-border confusion** | Alert near country/state border with different rules | Legal/jurisdictional issues | Low |

### 5.5 Risk Acknowledgment

These scenarios are documented to:

1. **Justify future safeguards** — When engineering asks "why do we need photo verification?", point here
2. **Prioritize MVP scope** — Critical risks need Day 1 mitigation; Low risks can wait
3. **Inform support training** — Support team needs to recognize these patterns
4. **Guide terms of service** — Legal must address these in ToS before launch

> **Principle:** Assume bad actors will find your platform. Design for abuse from Day 1, not after the first incident.

### 5.6 Mitigation Status

| Risk | MVP Mitigation | Post-MVP Enhancement |
|------|----------------|----------------------|
| False alerts | Account verification required | Community flagging, ML detection |
| Malicious targeting | Manual review queue | Automated content scanning |
| Spam flooding | Rate limits per user | IP-based throttling, device fingerprinting |
| False sightings | Owner can dismiss sightings | Reporter reputation score |
| Prohibited content | Basic word filter | Image moderation API |
| Extortion/safety | In-app messaging only (no direct contact) | Safety tips, report to authorities flow |

> **TODO:** Detailed moderation tooling spec to be developed separately.

---

## 6. User Segments

| Segment | Characteristics | Engagement Level | Location Strategy |
|---------|-----------------|------------------|-------------------|
| **Casual User** | Downloads app, minimal setup | Low | IP geolocation + postal code |
| **Engaged User** | Sets up saved locations | Medium | Manual zones + foreground GPS |
| **Power User** | Enables all permissions | High | Background location tracking |
| **Alert Creator** | Reports missing pets | Variable | Full location access required |

### Design Principle

The system must provide value to casual users while rewarding power users with better coverage. No user segment should be excluded from receiving relevant alerts.

---

## 7. Core Features

### 7.1 Alert Creation

A user reports a missing pet with:

- Pet details (name, species, breed, photos, description)
- Last known location (map selection or current GPS)
- Alert radius (default 5km, configurable 1-50km)
- Contact preferences
- Time last seen

### 7.2 Alert Distribution

The system determines which users to notify based on:

1. **Geographic relevance** — Is the user within or near the alert radius?
2. **Location confidence** — How accurate/fresh is the user's location data?
3. **User preferences** — Has the user opted into this type of alert?

### 7.3 Alert Consumption

Users receive notifications with:

- Pet photo and key details
- Distance from their location (when known)
- Map view of last known location
- Actions: "I've seen this pet" / "Share" / "Dismiss"

### 7.4 Sighting Reports

Users can report potential sightings with:

- Current location or map pin
- Optional photo
- Time of sighting
- Direction of travel (if observed)

---

## 8. Alert Lifecycle Rules

### 8.1 Alert States

```
┌──────────┐     ┌──────────┐     ┌──────────┐
│  DRAFT   │────▶│  ACTIVE  │────▶│ RESOLVED │
└──────────┘     └────┬─────┘     └──────────┘
                      │
                      ▼
                ┌──────────┐
                │ EXPIRED  │
                └──────────┘
```

| State | Description | Notifications |
|-------|-------------|---------------|
| **DRAFT** | Alert created but not published | None |
| **ACTIVE** | Alert is live, notifications being sent | Yes |
| **RESOLVED** | Pet found, alert closed by owner | Stopped |
| **EXPIRED** | Auto-expired after time limit | Stopped |

### 8.2 Expiration Rules

| Rule | Default | Rationale |
|------|---------|-----------|
| **Auto-expire duration** | 7 days | Most pets are found within 72h or not at all. 7 days allows for extended search without indefinite alerts. |
| **Renewal allowed** | Yes, up to 3 times | Owner can extend if still searching. Prevents abandoned alerts. |
| **Renewal duration** | +7 days each | Consistent extension period. |
| **Maximum lifetime** | 28 days | After 4 weeks, effectiveness drops significantly. |
| **Expiration warning** | 24 hours before | Notify owner to renew or resolve. |

> **TODO:** Validate 7-day default with user research. May need regional adjustment.

### 8.3 Ownership & Permissions

| Action | Who Can Perform | Notes |
|--------|-----------------|-------|
| **Create alert** | Any registered user | Requires account verification |
| **Edit alert details** | Alert creator only | See editing rules below |
| **Mark as resolved** | Alert creator only | Triggers resolution flow |
| **Renew alert** | Alert creator only | Resets expiration timer |
| **Delete alert** | Alert creator, Admin | Soft delete; data retained for audit |
| **Report alert** | Any user | Flag for moderation review |
| **Add sighting** | Any user | Creator notified immediately |

### 8.4 Editing Rules

**What CAN be edited after creation:**

| Field | Editable | Constraint |
|-------|----------|------------|
| Pet description | ✅ Yes | Free text updates |
| Pet photos | ✅ Yes | Add only, no removal (audit trail) |
| Contact preferences | ✅ Yes | Owner's choice |
| Additional notes | ✅ Yes | Append new information |

**What CANNOT be edited after creation:**

| Field | Editable | Rationale |
|-------|----------|-----------|
| Last known location | ❌ No | Would invalidate already-sent notifications |
| Alert radius | ❌ No | Would create inconsistent notification coverage |
| Pet species/breed | ❌ No | Core identification; create new alert if wrong |
| Creation timestamp | ❌ No | Audit integrity |

> **Workaround:** If location was wrong, owner can add a note: "UPDATE: Last seen at [new location]" and sightings will cluster around the correct area.

### 8.5 Resolution Flow

When an alert is marked as resolved:

```
Owner marks alert as "Found"
         │
         ▼
┌─────────────────────────────┐
│ 1. Stop new notifications   │
│ 2. Update alert status      │
│ 3. Notify sighting reporters│
│ 4. Prompt for success story │
│ 5. Archive alert (30 days)  │
│ 6. Permanently anonymize    │
└─────────────────────────────┘
```

**Post-Resolution Notifications:**

| Recipient | Notification |
|-----------|--------------|
| Users who received alert | Optional: "Good news! [Pet] has been found." (configurable) |
| Users who reported sightings | "The pet you helped look for has been found. Thank you!" |
| Alert creator | Prompt to share success story (optional, for community morale) |

> **Default:** Resolution notifications are OFF to avoid spam. Users can opt-in to "feel good" updates.

### 8.6 Abandoned Alert Handling

If owner doesn't respond to expiration warnings:

| Scenario | Action |
|----------|--------|
| No response to 24h warning | Send final reminder |
| No response to final reminder | Auto-expire with status "EXPIRED" |
| Owner account deleted | Alert expires immediately |
| Owner reported/banned | Alert reviewed by moderation |

**Data Retention:**

| Data | Retention | Rationale |
|------|-----------|-----------|
| Alert details | 90 days after resolution/expiration | Support inquiries, disputes |
| Sighting reports | 90 days | May help with future alerts |
| Notification logs | 30 days | Debugging, explainability |
| Anonymized statistics | Indefinite | Product improvement |

---

## 9. Location Strategy

### 9.1 The Location Freshness Problem

Mobile devices don't continuously report location. A user's "last known location" may be hours or days old, making it potentially inaccurate.

### 9.2 Layered Location Approach

```
┌─────────────────────────────────────────────────────────────────┐
│                    LOCATION DATA SOURCES                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Layer 4: Background GPS        ← Highest accuracy, most friction
│           (Power users only)                                    │
│                                                                 │
│  Layer 3: Saved Zones           ← High accuracy, low friction   │
│           (User-defined areas)                                  │
│                                                                 │
│  Layer 2: Foreground GPS        ← Good accuracy when app open   │
│           (When app is active)                                  │
│                                                                 │
│  Layer 1: IP + Postal Code      ← Low accuracy, zero friction   │
│           (Automatic fallback)                                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 9.3 Location Source Comparison

| Source | Accuracy | Battery Impact | Permission Required | Reliability |
|--------|----------|----------------|---------------------|-------------|
| Background GPS | ~10-100m | Medium | High (Always Allow) | High when granted |
| Foreground GPS | ~10-100m | Low | Medium (When In Use) | High |
| Saved Zones | Exact (user-defined) | None | None | 100% |
| Postal Code | ~1-5km | None | None | High |
| IP Geolocation | ~10-25km | None | None | Medium |

### 9.4 Confidence-Based Radius Expansion

When location data is stale or imprecise, expand the notification radius:

```
Effective Radius = Base Radius + Location Uncertainty + Age Decay

Where:
- Base Radius = Alert creator's chosen radius
- Location Uncertainty = Based on source (GPS: 0, IP: +15km)
- Age Decay = Hours since update × 0.2km (capped at 20km)
```

---

## 10. Notification Strategy

### 10.1 Targeting Algorithm

```
For each registered device:
  1. Check saved zones (highest priority)
  2. Check fresh GPS location (< 2 hours old)
  3. Check stale GPS location (< 24 hours, expanded radius)
  4. Check postal code match
  5. Check IP geolocation (expanded radius)
  
  Assign confidence: HIGH | MEDIUM | LOW
  
  If match found → Queue notification with confidence level
```

### 10.2 Notification Variants by Confidence

| Confidence | Title Style | Urgency | Example |
|------------|-------------|---------|---------|
| HIGH | Direct, urgent | High priority | "🚨 Missing dog: Max — Last seen 0.5km from you" |
| MEDIUM | Informative | Normal priority | "Missing dog nearby: Max — Keep an eye out" |
| LOW | Soft | Normal priority | "Missing pet alert in your area" |

### 10.3 Avoiding Notification Waste

- **Don't notify users > 50km away** even with maximum radius expansion
- **Respect user preferences** for notification frequency
- **Deduplicate** if user qualifies via multiple location sources
- **Rate limit** alerts per user per time period

---

## 11. Notification Explainability

### 11.1 Design Principle

**The system must be able to explain every notification decision.**

When a user asks "Why didn't I get notified about that missing dog near my house?", we must have a clear, honest answer. This is critical for:

- **User trust** — Unexplained silence feels like a broken app
- **Support efficiency** — Clear reasons reduce support tickets
- **Product improvement** — Understanding exclusions helps us improve targeting
- **Transparency commitment** — Users deserve to know how decisions are made

### 11.2 Exclusion Reasons (Canonical List)

Every non-notification must map to one of these reasons:

| Code | Reason | User-Facing Explanation |
|------|--------|-------------------------|
| `LOCATION_UNKNOWN` | No location data available | "We don't know your location. Add a zone or enable location services." |
| `LOCATION_STALE` | Location data too old (>7 days) | "Your location hasn't been updated recently. Open the app to refresh." |
| `LOCATION_TOO_FAR` | Outside alert radius (even with expansion) | "You were too far from the alert area to be notified." |
| `LOCATION_LOW_CONFIDENCE` | IP-only location, outside expanded radius | "Your approximate location wasn't close enough to the alert." |
| `NOTIFICATIONS_DISABLED` | User disabled notifications (OS or app) | "You have notifications turned off for FiFi Alert." |
| `NOTIFICATIONS_MUTED` | User muted this alert type | "You've muted alerts for this pet type/area." |
| `RATE_LIMITED` | Too many notifications recently | "We limited notifications to avoid overloading you." |
| `ALERT_EXPIRED` | Alert was resolved before processing | "The pet was found before we could notify you." |
| `DELIVERY_FAILED` | Push service reported failure | "Notification couldn't be delivered to your device." |
| `ZONE_INACTIVE` | User's saved zone is disabled | "Your saved zone for this area is currently turned off." |

### 11.3 Implementation Requirements

1. **Log every decision** — Store the exclusion reason for each device evaluated
2. **Make it queryable** — Support can look up "why wasn't user X notified for alert Y?"
3. **Surface in-app** — Users can view their notification history and see missed alerts with reasons
4. **No silent failures** — If we can't determine location, tell the user proactively

### 11.4 User-Facing Transparency

**In-App Notification History:**

```
┌─────────────────────────────────────────────────┐
│ Notification History                            │
├─────────────────────────────────────────────────┤
│ ✓ Missing cat: Whiskers          2 hours ago   │
│   Notified (within 3km of your home zone)      │
├─────────────────────────────────────────────────┤
│ ✗ Missing dog: Max               5 hours ago   │
│   Not notified: 12km from your known locations │
│   [View Alert Anyway]                          │
├─────────────────────────────────────────────────┤
│ ✗ Missing rabbit: Bun            1 day ago     │
│   Not notified: Location not updated in 3 days │
│   [Update Location]                            │
└─────────────────────────────────────────────────┘
```

### 11.5 Proactive Warnings

The app should warn users when their coverage is degraded:

| Condition | Warning |
|-----------|---------|
| Location > 24 hours old | "Your location is getting stale. You might miss nearby alerts." |
| No saved zones, no GPS permission | "Add a location zone to make sure you get relevant alerts." |
| Notifications disabled in OS | "Notifications are off. You won't receive any alerts." |
| All zones disabled | "All your alert zones are turned off." |

> **Principle:** It's better to tell a user "you won't be notified because X" than to silently fail and lose their trust.

---

## 12. Platform Considerations

### 12.1 iOS Constraints

| Constraint | Impact | Mitigation |
|------------|--------|------------|
| "Always Allow" permission is hard to obtain | Fewer users with background location | Emphasize saved zones as alternative |
| 30-second background execution limit | Limited processing time | Keep background tasks minimal |
| Aggressive battery optimization | Background tasks may be killed | Use significant location changes API |
| App Store review scrutiny | Must justify background location | Clear privacy policy, genuine need |

### 12.2 Android Constraints

| Constraint | Impact | Mitigation |
|------------|--------|------------|
| Background location requires separate permission (Android 10+) | Additional permission step | Clear explanation before requesting |
| Manufacturer-specific battery optimization | Background processes killed | Guide users to disable optimization |
| Foreground service notification required | Persistent notification visible | Make notification useful/informative |
| Doze mode delays | Background work deferred | Use high-priority FCM for critical alerts |

### 12.3 Cross-Platform Framework

**Recommended:** React Native with Expo

| Capability | Expo Support | Notes |
|------------|--------------|-------|
| Push notifications | ✅ Full | expo-notifications |
| Foreground location | ✅ Full | expo-location |
| Background location | ✅ Full | Requires development build |
| Geofencing | ⚠️ Limited | No native API; use server-side |
| Background tasks | ✅ Full | expo-task-manager |

---

## 13. Data Model Overview

### 13.1 Core Entities

```
User
├── id
├── email
├── push_tokens[]
├── notification_preferences
└── created_at

Device
├── id
├── user_id
├── push_token
├── platform (ios/android)
├── location_data
│   ├── gps_location (lat, lon, accuracy, updated_at)
│   ├── ip_location (lat, lon, city, updated_at)
│   └── postal_codes[]
├── saved_zones[]
│   ├── name
│   ├── lat, lon
│   ├── radius_km
│   └── is_active
└── last_app_open

Alert
├── id
├── creator_user_id
├── pet_details
│   ├── name
│   ├── species
│   ├── breed
│   ├── photos[]
│   └── description
├── location
│   ├── lat, lon
│   └── radius_km
├── status (active/resolved)
├── affected_postal_codes[]
└── created_at

Sighting
├── id
├── alert_id
├── reporter_user_id
├── location (lat, lon)
├── photo_url
├── notes
└── created_at

Notification
├── id
├── alert_id
├── device_id
├── confidence (high/medium/low)
├── match_reason
├── sent_at
└── opened_at
```

### 13.2 Geospatial Considerations

- Use PostGIS extension for PostgreSQL
- Store locations as `GEOGRAPHY(POINT, 4326)` type
- Create spatial indexes for efficient radius queries
- Pre-compute affected postal codes when alert is created

---

## 14. System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                           CLIENTS                                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │
│  │   iOS App   │  │ Android App │  │   Web App   │                 │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                 │
└─────────┼────────────────┼────────────────┼─────────────────────────┘
          │                │                │
          ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         API GATEWAY                                 │
│                    (Authentication, Rate Limiting)                  │
└─────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      APPLICATION SERVICES                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐ │
│  │    User     │  │    Alert    │  │  Location   │  │Notification│ │
│  │   Service   │  │   Service   │  │   Service   │  │  Service   │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        DATA LAYER                                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │
│  │ PostgreSQL  │  │    Redis    │  │   S3/Blob   │                 │
│  │  (PostGIS)  │  │   (Cache)   │  │  (Images)   │                 │
│  └─────────────┘  └─────────────┘  └─────────────┘                 │
└─────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    EXTERNAL SERVICES                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │
│  │  Firebase   │  │   APNs      │  │  Geocoding  │                 │
│  │    (FCM)    │  │  (iOS Push) │  │    APIs     │                 │
│  └─────────────┘  └─────────────┘  └─────────────┘                 │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 15. User Journey: Alert Flow

```
Pet Owner Creates Alert
         │
         ▼
┌─────────────────┐
│  Alert Service  │
│  - Validate     │
│  - Store        │
│  - Get postal   │
│    codes in     │
│    radius       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│Location Service │
│  - Find devices │
│    in radius    │
│  - Calculate    │
│    confidence   │
│  - Expand for   │
│    stale data   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Notification    │
│ Service         │
│  - Build        │
│    messages by  │
│    confidence   │
│  - Send via     │
│    FCM/APNs     │
│  - Log          │
└────────┬────────┘
         │
         ▼
    Users Receive
    Notifications
         │
         ▼
┌─────────────────┐
│ User Actions    │
│  - View alert   │
│  - Report       │
│    sighting     │
│  - Share        │
│  - Dismiss      │
└─────────────────┘
```

---

## 16. Privacy & Security

### 16.1 Data Minimization

- Store approximate locations, not continuous tracks
- Automatically delete location data older than 30 days
- Allow users to delete all their data

### 16.2 Location Privacy

- User's exact location is **never shared** with alert creators
- Only "within X km" is shown to other users
- Sighting locations can be made approximate at user's choice

### 16.3 Transparency

- Clear explanation of why location is needed
- In-app display of what data is stored
- Easy opt-out from location tracking

### 16.4 Security

- All API communication over HTTPS
- Push tokens stored encrypted
- Authentication required for all sensitive operations
- Rate limiting on alert creation

---

## 17. Success Metrics

### 17.1 User Engagement

| Metric | Target | Measurement |
|--------|--------|-------------|
| Notification open rate | > 30% | Opens / Notifications sent |
| Alert coverage | > 80% of users have location | Users with any location data |
| Power user conversion | > 15% | Users with background location |

### 17.2 Effectiveness

| Metric | Target | Measurement |
|--------|--------|-------------|
| Time to first sighting | < 2 hours | Median time from alert to first sighting |
| Resolution rate | > 40% | Alerts marked resolved / Total alerts |
| Notification relevance | < 5% unsubscribes | Unsubscribes / Notifications sent |

### 17.3 Technical Health

| Metric | Target | Measurement |
|--------|--------|-------------|
| Notification delivery rate | > 95% | Delivered / Sent (from FCM/APNs) |
| Location freshness | > 60% < 24h | Devices with location < 24h old |
| API latency (p95) | < 500ms | 95th percentile response time |

---

## 18. MVP Scope

### Phase 1: Core Alert System

- [ ] User registration and authentication
- [ ] Create missing pet alert with location
- [ ] Basic notification to users (postal code matching)
- [ ] View alert details
- [ ] Report sighting

### Phase 2: Location Intelligence

- [ ] Saved zones (manual location selection)
- [ ] Foreground GPS updates
- [ ] Confidence-based notification targeting
- [ ] Location status indicator in app

### Phase 3: Advanced Features

- [ ] Background location tracking (opt-in)
- [ ] Sighting clustering and alerts to owner
- [ ] Social sharing integration
- [ ] Analytics dashboard for alert creators

### Phase 4: Community Features

- [ ] User reputation/karma system
- [ ] Neighborhood groups
- [ ] Success stories feed
- [ ] Integration with shelters/vets

---

## 19. Open Questions

1. **Monetization** — Free with premium features? Donation-based? Sponsored by pet businesses?

2. **Moderation** — How to handle false/spam alerts? Require photo verification?

3. **Multi-language** — Support for multiple languages in notifications?

4. **Offline support** — Cache alerts for viewing without connectivity?

5. **Integration** — Partner with existing pet registries (microchip databases)?

6. **Sighting verification** — How to handle false sightings? Reputation system?

---

## 20. Next Steps

### Immediate Actions

1. **Technical Specification** — Detail API contracts, database schema, notification payloads
2. **UI/UX Design** — Wireframes and prototypes for core flows
3. **Infrastructure Setup** — Cloud environment, CI/CD, monitoring
4. **Proof of Concept** — Minimal app demonstrating location + notification flow

### Documents to Create

- [ ] API Specification (OpenAPI/Swagger)
- [ ] Database Schema Design
- [ ] Mobile App Architecture
- [ ] Notification Service Design
- [ ] Privacy Policy & Terms of Service
- [ ] Testing Strategy

---

## Appendix A: Glossary

| Term | Definition |
|------|------------|
| **Alert** | A report of a missing pet with location and details |
| **Alert Radius** | The geographic area around an alert where users should be notified |
| **Confidence Level** | How certain we are that a user is actually in the alert area |
| **Saved Zone** | A user-defined location they want to monitor |
| **Sighting** | A user report of potentially seeing a missing pet |
| **Background Location** | GPS tracking when app is not actively in use |
| **Geofencing** | OS-level monitoring of entering/exiting geographic areas |

---

## Appendix B: References

- [Apple Human Interface Guidelines - Requesting Permission](https://developer.apple.com/design/human-interface-guidelines/privacy)
- [Android Background Location Access](https://developer.android.com/training/location/background)
- [Expo Location Documentation](https://docs.expo.dev/versions/latest/sdk/location/)
- [Firebase Cloud Messaging](https://firebase.google.com/docs/cloud-messaging)
- [PostGIS Documentation](https://postgis.net/documentation/)

---

*This document is a living document and will be updated as requirements evolve.*

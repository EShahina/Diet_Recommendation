# security_spec.md - Firestore Security Specifications

This spec maps the security boundaries, invariant rules, and hostile payloads for the NeuroPlate database structure.

## 1. Data Invariants

1. **User Identity Invariant**: A user can only read, create, or modify documents inside their own `/users/{userId}/...` path tree. Any request to read/write under a different `userId` must be blocked.
2. **Schema Invariant**: Every meal log, corrective task, public profile, and private profile doc must comply with type and boundary limits.
3. **Immutability Invariant**: Core identifiers (like `userId` and `id`) and creation timestamps (`createdAt`, `timestamp`) cannot be changed after creation. All times must match `request.time`.
4. **Behavioral Actions Restriction**: Fields like `isCompleted` of a task can only be toggled to `true`.
5. **PII and Sensitive Health Isolation**: Access to a user's health condition (`issue`) or contact info (`phone`) must be restricted only to the verified user owner.

---

## 2. The "Dirty Dozen" Hostile Payloads

The following 12 payloads attempt to breach Identity, Integrity, and State limits:

### Payload 1: Write to other user's public profile (Identity Spoof)
*   **Path**: `/users/other_user_id/public/profile`
*   **Action**: `set`
*   **Payload**: `{ "displayName": "Attacker", "registrationDate": "2026-06-02T00:00:00Z" }`
*   **Expected Result**: `PERMISSION_DENIED`

### Payload 2: Spoof Creator ID on Meal Log (Identity Theft)
*   **Path**: `/users/victim_user_id/meals/meal_abc_123`
*   **Action**: `set`
*   **Payload**: `{ "id": "meal_abc_123", "userId": "attacker_user_id", "timestamp": "2026-06-02T12:00:00Z", "description": "Salad", "analysis": {} }`
*   **Expected Result**: `PERMISSION_DENIED`

### Payload 3: Inject Massive ID to Crash Wallet (Resource Poisoning)
*   **Path**: `/users/legit_user/meals/extremely_long_id_that_exceeds_128_characters_and_contains_dangerous_unescaped_special_characters_acting_as_denial_of_wallet_vector`
*   **Action**: `set`
*   **Payload**: `{ "id": "extremely_long_id...", "userId": "legit_user", "timestamp": "2026-06-02T12:00:00Z", "description": "Protein Shake", "analysis": { "calories": 250, "protein": 30, "carbs": 10, "fat": 5, "disciplineScore": 95 } }`
*   **Expected Result**: `PERMISSION_DENIED`

### Payload 4: Bypass Validation on Meal Log (Missing Keys / Shadow Updates)
*   **Path**: `/users/legit_user/meals/meal1`
*   **Action**: `set`
*   **Payload**: `{ "id": "meal1", "userId": "legit_user", "timestamp": "2026-06-02T12:00:00Z" }` (Missing `description` and `analysis`)
*   **Expected Result**: `PERMISSION_DENIED`

### Payload 5: Spoof Verified Status using unverified email
*   **Path**: `/users/admin_user_id/private/sensitive`
*   **Action**: `set`
*   **Request Auth**: `email_verified: false`
*   **Payload**: `{ "email": "admin@example.com", "issue": "epilepsy", "dietPreference": "keto" }`
*   **Expected Result**: `PERMISSION_DENIED` (Rules mandate verified email for writes)

### Payload 6: Mutate Immutable Creation Dates to spoof logs
*   **Path**: `/users/legit_user/meals/meal1`
*   **Action**: `update`
*   **Payload**: `{ "timestamp": "2020-01-01T12:00:00Z" }` (Altering previous log registration date)
*   **Expected Result**: `PERMISSION_DENIED`

### Payload 7: Update other fields during Task Complete Action (Privilege Escalation)
*   **Path**: `/users/legit_user/tasks/task1`
*   **Action**: `update`
*   **Payload**: `{ "isCompleted": true, "mealType": "dinner", "title": "Bypass Workout Description Spoof" }` (Affected keys must ONLY be `isCompleted`)
*   **Expected Result**: `PERMISSION_DENIED`

### Payload 8: Blanket User Read Scraping without UID checks (Data Harvesting)
*   **Path**: `/users/{any_uid}/private/sensitive`
*   **Action**: `list` (Querying all users)
*   **Expected Result**: `PERMISSION_DENIED`

### Payload 9: Set Self-Claimed Custom Goals to absurd values (Value Poisoning)
*   **Path**: `/users/legit_user/private/sensitive`
*   **Action**: `set`
*   **Payload**: `{ "email": "test@test.com", "issue": "migraine", "dietPreference": "keto", "customCalories": 1000000, "customProtein": -50 }` (Macro targets out of limits)
*   **Expected Result**: `PERMISSION_DENIED`

### Payload 10: State Shortcut of Corrective Task (Task Created Already Completed)
*   **Path**: `/users/legit_user/tasks/task1`
*   **Action**: `create`
*   **Payload**: `{ "id": "task1", "userId": "legit_user", "title": "Do 10 pushups", "mealType": "breakfast", "isCompleted": true, "createdAt": "2026-06-02T12:00:00Z" }` (Task must be created incomplete)
*   **Expected Result**: `PERMISSION_DENIED`

### Payload 11: Modify Task Details after Creation
*   **Path**: `/users/legit_user/tasks/task1`
*   **Action**: `update`
*   **Payload**: `{ "title": "Changed Title" }`
*   **Expected Result**: `PERMISSION_DENIED`

### Payload 12: Read other users' private profiles
*   **Path**: `/users/victim_user/private/sensitive`
*   **Action**: `get`
*   **Request User Auth**: `request.auth.uid: attacker_user`
*   **Expected Result**: `PERMISSION_DENIED`

---

## 3. Test Verification Rules Blueprint

These statements formulate our Firestore rules assertions:

1. `request.auth.uid == userId` must hold for all operations outside public lookups.
2. `request.auth.token.email_verified == true` confirms user verification legitimacy.
3. Creation fields like `createdAt` must strictly match `request.time`.
4. Updates must strictly isolate mutations using `affectedKeys()`.

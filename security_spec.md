# Security Specification

## Data Invariants
1. A user's state only exists under their own UID.
2. User profile/state can only be modified by the user themselves.
3. User must have a verified email to perform write operations (production hardening).
4. Any document ID must be a standard alphanumeric string.
5. Critical fields (habits, goals, tasks) must be lists and have size boundaries to prevent resource exhaustion.

## The "Dirty Dozen" Payloads

1. **Identity Theft**: Attempting to write to another user's document.
2. **Unverified Sabotage**: Attempting to write with `email_verified: false`.
3. **Payload Bloating**: Sending a list of 100,000 habits to crash the sync.
4. **Type Confusion**: Sending a string instead of a list for `tasks`.
5. **Shadow Fields**: Adding an `isAdmin: true` field to the root document.
6. **ID Poisoning**: Using a 2MB string as the `userId`.
7. **Phantom Sync**: Writing to a subcollection not defined in the schema.
8. **Null Poisoning**: Setting `journalEntries` to `null`.
9. **Zero-Byte Attack**: Setting all fields to empty strings but maintaining the map structure.
10. **State Corruption**: Writing a tasks array with invalid internal structure (though deep validation is limited in rules, basic type checks apply at root).
11. **Orphaned Write**: Writing a user document without required fields (habits, goals, etc).
12. **Anonymous Squatting**: Attempting to write as an unauthenticated user.

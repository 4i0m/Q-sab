# Security Specification & Threat Model for Q Social Network

## 1. Data Invariants
1. **User Identity Integrity**: A user can only register or edit their own profile document (`/users/{userId}` where `userId == request.auth.uid`). Users cannot assign themselves `role: 'admin'` or `role: 'owner'`.
2. **PII Isolation**: Email and sensitive private credentials live in `/users/{userId}/private/{docId}` and are only readable by the owner (`request.auth.uid == userId`) or verified administrators (`sabosenpai33@gmail.com`).
3. **Author Verification**: Posts, comments, messages, and stories can only be created with `authorId == request.auth.uid` or `senderId == request.auth.uid`.
4. **Conversation Confidentiality**: Conversations and their subcollection messages are strictly accessible ONLY to members whose UID is present in `resource.data.participantIds` (or path match).
5. **Like & Follow Idempotence**: A user can only write a like document under `/posts/{postId}/likes/{userId}` where `userId == request.auth.uid`.
6. **Presence Truth**: Users can only update their own presence document `/presence/{userId}` with their own UID.
7. **Moderation & Administrative Roles**: Only authenticated users with verified email `sabosenpai33@gmail.com` (or recorded admin role) can delete arbitrary posts or manage administrative controls.
8. **Immutability of History**: `createdAt` and `authorId` cannot be changed after creation.

## 2. The Dirty Dozen Payloads (Rejection Targets)
1. **Privilege Escalation**: Normal user sending `{ role: 'admin' }` on user profile update. -> PERMISSION_DENIED.
2. **Impersonated Post Creation**: User `userB` submitting a post with `authorId: 'userA'`. -> PERMISSION_DENIED.
3. **Ghost Field Injection**: Adding `{ verifiedBadge: true, reachMultiplier: 999 }` in a post update. -> PERMISSION_DENIED.
4. **Chat Eavesdropping**: User `userC` attempting to read `/conversations/{convId}` where `participantIds` does not contain `userC`. -> PERMISSION_DENIED.
5. **Message Forgery**: User `userC` attempting to insert a message into `/conversations/{convId}/messages/{msgId}` without being a participant. -> PERMISSION_DENIED.
6. **Unbounded ID Injection**: User attempting to create a document with a 20KB garbage ID. -> PERMISSION_DENIED via `isValidId()`.
7. **Like Count Manipulation**: Direct write to someone else's like record `/posts/{postId}/likes/{someoneElseUid}`. -> PERMISSION_DENIED.
8. **Story Hijacking**: Deleting or updating another user's story without admin role. -> PERMISSION_DENIED.
9. **Fake Presence Spoofing**: User `userA` writing a presence heartbeat for `userB`. -> PERMISSION_DENIED.
10. **Timestamp Manipulation**: Submitting a post with client timestamp far in the future or tampering with immutable `createdAt`. -> PERMISSION_DENIED.
11. **PII Harvesting**: User attempting to read `/users/{otherUser}/private/info`. -> PERMISSION_DENIED.
12. **Unauthenticated Access**: Any write or restricted read without valid Firebase authentication. -> PERMISSION_DENIED.

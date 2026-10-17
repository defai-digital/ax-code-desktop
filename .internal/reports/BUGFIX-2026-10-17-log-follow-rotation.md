# Log-follow rotation and truncation

Both Desktop CI and signed-shadow preflight exposed the rotation regression on Linux: expected `rotated-first`, but output started with `nd` from the old byte offset. The follower stored dev/ino but closed every descriptor between polls. Linux can reuse an inode immediately after unlink, so a replacement with a larger size was mistaken for an append.

The follower now retains one descriptor until the replacement is opened, keeping the old inode allocated. New files are read from zero; descriptor ownership is transferred on rotation and released on stop. This remains a polling reader and does not retain the entire log.

A deterministic companion regression first returned `old-unfinished-linenew` instead of `new` after truncating a file with a pending partial line. Truncation now clears the pending remainder. A separate lifecycle regression verifies all observed log descriptors are closed when following stops. Existing whole-line rotation coverage remains enabled.

Candidate `d822cd5762afc28c5c148cc41dfbdee4d1d7baf6` is superseded. Its passing CodeQL and Windows native regression steps do not qualify the newer application source. Fresh exact-source workflows, signed packages and four native installer receipts are required.

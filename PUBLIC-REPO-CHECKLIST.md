# Before switching the repository to Public

1. Upload the sanitized v1.6.0 files.
2. Confirm real credentials exist only in Render Environment Variables and GitHub Actions Secrets.
3. Review the **entire Git history** for previously committed keys, tokens or passwords.
4. If a credential ever appeared in Git history, revoke/rotate it before going public.
5. Then change repository visibility to Public.
6. After publication, review GitHub Security / Secret scanning alerts.

Important: checking only the current files cannot prove that old commits contain no secrets.

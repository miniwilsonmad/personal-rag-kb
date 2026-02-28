# Minimax API Setup (Coding Plan)

This guide explains how to get your Group ID when using a Minimax Coding Plan API key. The error `"token not match group"` means your API key and Group ID do not belong to the same account/group.

## Prerequisites

- Minimax account at [platform.minimax.io](https://platform.minimax.io)
- Coding Plan API key (or Pay-as-you-go key)

## Step 1: Log in to Minimax Platform

1. Go to [platform.minimax.io/login](https://platform.minimax.io/login)
2. Sign in to your account

## Step 2: Find Your Group ID

1. In the console, go to **User Center** (or **Account**)
2. Open **Basic Information** (or **Your Profile**)
3. Locate the **Group ID** field — it is a 19-digit number
4. Copy it using the copy icon

**Direct link:** [Basic Information / Interface Key](https://platform.minimax.io/user-center/basic-information/interface-key)

## Step 3: Verify API Key and Group ID Match

- **Coding Plan keys** and **Pay-as-you-go keys** are tied to your account’s Group ID
- The Group ID you use in requests must be the same one for the account that created the API key
- If you have multiple groups or workspaces, use the Group ID shown on the same page where you created the key

## Step 4: Add to .env

```env
MINIMAX_API_KEY=sk-cp-xxxxx...
MINIMAX_GROUP_ID=1234567890123456789
```

Replace `MINIMAX_GROUP_ID` with your actual 19-digit Group ID.

## Plan Types

| Plan | Key creation | Models |
|------|--------------|--------|
| **Coding Plan** | [Create Coding Plan Key](https://platform.minimax.io/user-center/basic-information/interface-key) | Text only |
| **Pay-as-you-go** | [Create new secret key](https://platform.minimax.io/user-center/basic-information/interface-key) | Text, Video, Speech, Image |

## Troubleshooting

| Error | Cause | Fix |
|-------|------|-----|
| `token not match group` | Group ID does not match the account that owns the API key | Copy the Group ID from the same Basic Information page where you created the key |
| `status_code: 1004` | Same as above | Ensure `MINIMAX_GROUP_ID` in `.env` is the 19-digit ID from your account |
| Invalid API key | Key expired, revoked, or wrong | Create a new key at the interface key page and update `.env` |

## References

- [Minimax Quickstart](https://platform.minimax.io/docs/guides/quickstart)
- [Coding Plan Overview](https://platform.minimax.io/docs/coding-plan/intro)
- [API Keys & Basic Information](https://platform.minimax.io/user-center/basic-information/interface-key)

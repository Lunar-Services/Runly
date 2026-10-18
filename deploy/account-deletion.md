# Account deletion requests

The account settings flow stores a request for operator review. It does not
delete user data, remove projects or files, or cancel a Stripe subscription.
The account stays active while a request is pending. Customers can cancel a
pending request from the same settings page.

## Review queue

Use an authorized database connection to review pending requests:

```sql
select id, user_id, email, requested_at
from public.account_deletion_requests
where status = 'pending'
order by requested_at asc;
```

The table has no customer-facing insert or update policy. The application
records requests and cancellations through its service role after verifying
the signed-in customer. Treat the stored email as request context; verify the
account owner through the normal support process before taking action.

## Complete a request

1. Recheck that the request is still `pending` and belongs to the account being
   reviewed. Do not process a cancelled request.
2. Review the account's active Stripe subscriptions and invoices. Handle any
   cancellation or refund according to the applicable billing policy. The
   customer request itself does not change Stripe state.
3. Inspect and clean up the user's projects, runtime resources, stored files,
   attachments, and any other records that require operator handling. Review
   current foreign keys and service-specific storage before deleting the auth
   user; project and billing relationships can prevent deletion or leave
   external resources behind.
4. Follow the organization's retention requirements for the request and any
   billing records. The request row references `auth.users` with `ON DELETE
CASCADE`, so preserve an audit record separately first if retention policy
   requires one.
5. Only after the required cleanup and review are complete, delete the auth
   user through the approved administrative process. Do not treat changing the
   request status as a substitute for data cleanup.

There is intentionally no automated completion endpoint or SQL deletion
script. This runbook describes a manual review process; operators must use the
current production data model and approved retention and billing procedures.

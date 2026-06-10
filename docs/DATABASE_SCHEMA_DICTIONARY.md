# Eventos_DB Enterprise Schema Dictionary

## Schema: marketplace
### Table: apps
| Column | Type | Nullable |
|---|---|---|
| id | uuid | NO |
| name | character varying | NO |
| description | text | YES |
| category | character varying | NO |
| created_at | timestamp with time zone | NO |

### Table: reviews
| Column | Type | Nullable |
|---|---|---|
| id | uuid | NO |
| app_id | uuid | NO |
| reviewer_id | uuid | NO |
| rating | integer | NO |
| comment | text | YES |
| created_at | timestamp with time zone | NO |

### Table: installations
| Column | Type | Nullable |
|---|---|---|
| id | uuid | NO |
| app_id | uuid | NO |
| organization_id | uuid | NO |
| status | character varying | NO |
| created_at | timestamp with time zone | NO |

## Schema: crm
### Table: accounts
| Column | Type | Nullable |
|---|---|---|
| id | uuid | NO |
| name | character varying | NO |
| website | character varying | YES |
| industry | character varying | YES |
| created_at | timestamp with time zone | NO |

### Table: contacts
| Column | Type | Nullable |
|---|---|---|
| id | uuid | NO |
| account_id | uuid | YES |
| first_name | character varying | NO |
| last_name | character varying | NO |
| email | character varying | NO |
| created_at | timestamp with time zone | NO |

### Table: leads
| Column | Type | Nullable |
|---|---|---|
| id | uuid | NO |
| contact_id | uuid | NO |
| status | character varying | NO |
| source | character varying | YES |
| created_at | timestamp with time zone | NO |

## Schema: support
### Table: support_tickets
| Column | Type | Nullable |
|---|---|---|
| id | uuid | NO |
| organization_id | uuid | NO |
| creator_id | uuid | NO |
| assigned_to | uuid | YES |
| subject | character varying | NO |
| status | character varying | NO |
| priority | character varying | NO |
| created_at | timestamp with time zone | NO |
| updated_at | timestamp with time zone | NO |

### Table: ticket_comments
| Column | Type | Nullable |
|---|---|---|
| id | uuid | NO |
| ticket_id | uuid | NO |
| author_id | uuid | NO |
| content | text | NO |
| created_at | timestamp with time zone | NO |

## Schema: audit
### Table: impersonation_logs
| Column | Type | Nullable |
|---|---|---|
| id | uuid | NO |
| super_admin_id | uuid | NO |
| target_organization_id | uuid | NO |
| target_user_id | uuid | YES |
| approved_by | uuid | YES |
| reason | text | NO |
| started_at | timestamp with time zone | NO |
| session_expires_at | timestamp with time zone | NO |
| terminated_at | timestamp with time zone | YES |
| ip_address | character varying | YES |
| user_agent | text | YES |

### Table: permission_changes
| Column | Type | Nullable |
|---|---|---|
| id | uuid | NO |
| acting_user_id | uuid | NO |
| target_user_id | uuid | YES |
| action | character varying | NO |
| entity_type | character varying | NO |
| entity_id | uuid | NO |
| old_values | jsonb | YES |
| new_values | jsonb | YES |
| ip_address | character varying | YES |
| user_agent | text | YES |
| request_id | uuid | YES |
| correlation_id | uuid | YES |
| occurred_at | timestamp with time zone | NO |

### Table: logs
| Column | Type | Nullable |
|---|---|---|
| id | uuid | NO |
| request_id | uuid | YES |
| correlation_id | uuid | YES |
| organization_id | uuid | YES |
| event_id | uuid | YES |
| user_id | uuid | YES |
| acting_user_id | uuid | YES |
| target_user_id | uuid | YES |
| entity_type | character varying | NO |
| entity_id | uuid | NO |
| action | character varying | NO |
| severity | character varying | NO |
| old_values | jsonb | YES |
| new_values | jsonb | YES |
| ip_address | inet | YES |
| user_agent | text | YES |
| geo_location | jsonb | YES |
| row_hash | character varying | YES |
| occurred_at | timestamp with time zone | NO |
| retention_until | timestamp with time zone | YES |

### Table: api_logs
| Column | Type | Nullable |
|---|---|---|
| id | uuid | NO |
| request_id | uuid | NO |
| correlation_id | uuid | YES |
| method | character varying | NO |
| path | character varying | NO |
| status_code | integer | NO |
| duration_ms | double precision | NO |
| db_query_count | integer | NO |
| db_query_duration_ms | double precision | NO |
| cache_hit | boolean | YES |
| ip_address | inet | YES |
| user_id | uuid | YES |
| user_agent | text | YES |
| request_size_bytes | integer | NO |
| response_size_bytes | integer | NO |
| rate_limit_remaining | integer | YES |
| occurred_at | timestamp with time zone | NO |

### Table: worker_logs
| Column | Type | Nullable |
|---|---|---|
| id | uuid | NO |
| job_id | character varying | NO |
| correlation_id | uuid | YES |
| task_name | character varying | NO |
| queue | character varying | NO |
| status | character varying | NO |
| wait_duration_ms | double precision | NO |
| execution_duration_ms | double precision | NO |
| worker_name | character varying | YES |
| memory_usage_bytes | integer | YES |
| cpu_usage_percent | double precision | YES |
| retry_count | integer | NO |
| exception | text | YES |
| stack_trace | text | YES |
| args | text | YES |
| kwargs | text | YES |
| queued_at | timestamp with time zone | NO |
| started_at | timestamp with time zone | YES |
| finished_at | timestamp with time zone | YES |

### Table: security_logs
| Column | Type | Nullable |
|---|---|---|
| id | uuid | NO |
| event_type | character varying | NO |
| severity | character varying | NO |
| log_metadata | jsonb | NO |
| created_at | timestamp with time zone | NO |

### Table: data_exports
| Column | Type | Nullable |
|---|---|---|
| id | uuid | NO |
| requested_by | uuid | NO |
| status | character varying | NO |
| created_at | timestamp with time zone | NO |

### Table: system_changes
| Column | Type | Nullable |
|---|---|---|
| id | uuid | NO |
| entity_type | character varying | NO |
| change_type | character varying | NO |
| changes | jsonb | NO |
| created_at | timestamp with time zone | NO |

### Table: access_reviews
| Column | Type | Nullable |
|---|---|---|
| id | uuid | NO |
| reviewer_id | uuid | NO |
| status | character varying | NO |
| created_at | timestamp with time zone | NO |

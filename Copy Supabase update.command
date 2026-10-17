#!/bin/bash
# Double-click: copies the whole Supabase update to your clipboard.
# Then in Supabase › SQL Editor › New query, press Cmd+V and click Run.
cd "$(dirname "$0")"
pbcopy < supabase/RUN-THIS-IN-SUPABASE.sql
echo ""
echo "  Copied! ($(wc -l < supabase/RUN-THIS-IN-SUPABASE.sql | tr -d ' ') lines)"
echo "  Now go to Supabase › SQL Editor › New query, press Cmd+V, then click Run."
echo ""
open "https://supabase.com/dashboard/project/bdyjlmgjtrzqmohkklcg/sql/new"
read -p "  Press Return to close this window."

"""Automated Swing Trader model training package.

Runs in GitHub Actions. Reads training data only through the authenticated
`export-training-dataset` edge function and writes results only through the
`ml-model-registry` edge function. The Supabase service-role key is never used
here.
"""

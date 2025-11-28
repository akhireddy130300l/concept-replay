-- Add deleted_at column to learned_topics table for soft delete
ALTER TABLE learned_topics ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Create index for efficient filtering of non-deleted topics
CREATE INDEX idx_learned_topics_deleted_at ON learned_topics(deleted_at) WHERE deleted_at IS NULL;

DROP POLICY IF EXISTS "Allow insert via service role or anon for email links" ON public.quiz_responses;
DROP POLICY IF EXISTS "Allow insert for rewards" ON public.user_rewards;

CREATE POLICY "Users can insert their own quiz responses"
  ON public.quiz_responses
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can insert their own rewards"
  ON public.user_rewards
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

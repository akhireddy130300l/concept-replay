import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Brain, LogOut, Plus, Calendar, BookOpen, Trash2, Archive, Pencil, RefreshCw, Clock, Info, Trophy, Flame, Target, Star, ChevronDown, ChevronUp, XCircle, CheckCircle2, History, Sparkles, Headphones } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ReminderSettings, type UserPreferences } from "@/components/ReminderSettings";
import { nextRevisionInstant, formatInTz, getBrowserTimezone } from "@/lib/reminderTime";
import { AutomationStatus } from "@/components/AutomationStatus";
import { ModelPerformanceCard } from "@/components/ModelPerformanceCard";
import { AppShell } from "@/components/layouts/AppShell";
import { PageHeader } from "@/components/layouts/PageHeader";
import { StatTile } from "@/components/layouts/StatTile";

const TruncatedText = ({ text, maxLength = 120, className }: { text: string; maxLength?: number; className?: string }) => {
  const [expanded, setExpanded] = useState(false);
  const needsTruncation = text.length > maxLength;
  
  return (
    <div className={className || "text-muted-foreground text-sm mb-3"}>
      <p>{expanded || !needsTruncation ? text : `${text.slice(0, maxLength)}...`}</p>
      {needsTruncation && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-primary text-xs font-medium mt-1 hover:underline"
        >
          {expanded ? "See less" : "See more"}
        </button>
      )}
    </div>
  );
};

interface Topic {
  id: string;
  title: string;
  description: string;
  learned_date: string;
  next_revision_date: string;
  deleted_at?: string | null;
  is_daily?: boolean;
}

const RANK_THRESHOLDS = [
  { name: "Bronze", minPoints: 0, emoji: "🥉" },
  { name: "Silver", minPoints: 50, emoji: "🥈" },
  { name: "Gold", minPoints: 150, emoji: "🥇" },
  { name: "Platinum", minPoints: 300, emoji: "💎" },
  { name: "Diamond", minPoints: 500, emoji: "💠" },
  { name: "Crown", minPoints: 800, emoji: "👑" },
  { name: "Ace", minPoints: 1200, emoji: "🏆" },
  { name: "Conqueror", minPoints: 2000, emoji: "⚔️" },
];

function getRankEmoji(rank: string): string {
  return RANK_THRESHOLDS.find(r => r.name === rank)?.emoji || "🥉";
}

function getNextRank(currentRank: string, points: number) {
  const idx = RANK_THRESHOLDS.findIndex(r => r.name === currentRank);
  if (idx < RANK_THRESHOLDS.length - 1) return RANK_THRESHOLDS[idx + 1];
  return null;
}

function getProgressToNextRank(currentRank: string, points: number): number {
  const idx = RANK_THRESHOLDS.findIndex(r => r.name === currentRank);
  if (idx >= RANK_THRESHOLDS.length - 1) return 100;
  const current = RANK_THRESHOLDS[idx].minPoints;
  const next = RANK_THRESHOLDS[idx + 1].minPoints;
  return Math.min(100, Math.round(((points - current) / (next - current)) * 100));
}

const Dashboard = () => {
  const [user, setUser] = useState<any>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [deletedTopics, setDeletedTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTopic, setNewTopic] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newIsDaily, setNewIsDaily] = useState(false);
  const [adding, setAdding] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [topicToDelete, setTopicToDelete] = useState<string | null>(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingTopic, setEditingTopic] = useState<Topic | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editNextRevisionDate, setEditNextRevisionDate] = useState("");
  const [editNextRevisionTime, setEditNextRevisionTime] = useState("");
  const [updating, setUpdating] = useState(false);
  const [rewards, setRewards] = useState<any>(null);
  const [quizHistory, setQuizHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);

  // Spaced repetition intervals in days
  const spacedRepetitionIntervals = [1, 3, 7, 14, 30, 60];
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate("/auth");
      } else {
        setUser(session.user);
        fetchTopics();
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        navigate("/auth");
      } else {
        setUser(session.user);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const fetchTopics = async () => {
    try {
      const { data: activeData, error: activeError } = await supabase
        .from("learned_topics")
        .select("*")
        .is("deleted_at", null)
        .order("learned_date", { ascending: false });

      if (activeError) throw activeError;
      setTopics(activeData || []);

      const { data: deletedData, error: deletedError } = await supabase
        .from("learned_topics")
        .select("*")
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false });

      if (deletedError) throw deletedError;
      setDeletedTopics(deletedData || []);

      // Fetch rewards
      const { data: rewardsData } = await supabase
        .from("user_rewards")
        .select("*")
        .single();
      setRewards(rewardsData);

      // Fetch quiz history
      const { data: quizData } = await supabase
        .from("quiz_responses")
        .select("*")
        .order("answered_at", { ascending: false })
        .limit(50);
      setQuizHistory(quizData || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to load topics",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddTopic = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newTopic.trim()) {
      toast({
        title: "Error",
        description: "Please enter a topic title",
        variant: "destructive",
      });
      return;
    }

    setAdding(true);

    try {
      const learnedDate = new Date();
      // Rolling schedule: first reminder exactly 24 hours after the topic is added
      const nextRevisionDate = new Date(learnedDate.getTime() + 24 * 60 * 60 * 1000);


      const { error } = await supabase.from("learned_topics").insert({
        title: newTopic,
        description: newDescription,
        learned_date: learnedDate.toISOString(),
        next_revision_date: nextRevisionDate.toISOString(),
        revision_count: 0,
        user_id: user.id,
        is_daily: newIsDaily,
      });

      if (error) throw error;

      // Update topic streak
      await updateTopicStreak();

      toast({
        title: "Success!",
        description: newIsDaily ? "Daily topic added - you'll receive reminders every day!" : "Topic added successfully",
      });

      setNewTopic("");
      setNewDescription("");
      setNewIsDaily(false);
      fetchTopics();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setAdding(false);
    }
  };

  const updateTopicStreak = async () => {
    const today = new Date().toISOString().split("T")[0];
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split("T")[0];

    const { data: existing } = await supabase
      .from("user_rewards")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (existing) {
      if (existing.last_topic_date === today) return; // already counted today
      const isConsecutive = existing.last_topic_date === yesterdayStr;
      const newStreak = isConsecutive ? (existing.topic_streak || 0) + 1 : 1;
      await supabase
        .from("user_rewards")
        .update({
          topic_streak: newStreak,
          longest_topic_streak: Math.max(newStreak, existing.longest_topic_streak || 0),
          last_topic_date: today,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);
    } else {
      await supabase.from("user_rewards").insert({
        user_id: user.id,
        topic_streak: 1,
        longest_topic_streak: 1,
        last_topic_date: today,
      });
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  const handleEditClick = (topic: Topic) => {
    setEditingTopic(topic);
    setEditTitle(topic.title);
    setEditDescription(topic.description || "");
    const nextRevDate = new Date(topic.next_revision_date);
    setEditNextRevisionDate(nextRevDate.toISOString().split('T')[0]);
    setEditNextRevisionTime(nextRevDate.toTimeString().slice(0, 5));
    setEditDialogOpen(true);
  };

  const handleEditSave = async () => {
    if (!editingTopic || !editTitle.trim()) {
      toast({
        title: "Error",
        description: "Please enter a topic title",
        variant: "destructive",
      });
      return;
    }

    setUpdating(true);

    try {
      const nextRevisionDateTime = new Date(`${editNextRevisionDate}T${editNextRevisionTime}`);
      
      const { error } = await supabase
        .from("learned_topics")
        .update({
          title: editTitle.trim(),
          description: editDescription.trim() || null,
          next_revision_date: nextRevisionDateTime.toISOString(),
        })
        .eq("id", editingTopic.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Topic updated successfully",
      });

      fetchTopics();
      setEditDialogOpen(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setUpdating(false);
    }
  };

  const handleDeleteClick = (topicId: string) => {
    setTopicToDelete(topicId);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!topicToDelete) return;

    try {
      const { error } = await supabase
        .from("learned_topics")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", topicToDelete);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Topic deleted and archived",
      });

      fetchTopics();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setDeleteDialogOpen(false);
      setTopicToDelete(null);
    }
  };

  const handleToggleDaily = async (topicId: string, isDaily: boolean) => {
    try {
      const nextRevisionDate = new Date();
      if (isDaily) {
        // If switching to daily, set next revision to tomorrow
        nextRevisionDate.setDate(nextRevisionDate.getDate() + 1);
      }

      const { error } = await supabase
        .from("learned_topics")
        .update({ 
          is_daily: isDaily,
          next_revision_date: nextRevisionDate.toISOString()
        })
        .eq("id", topicId);

      if (error) throw error;

      toast({
        title: isDaily ? "Daily reminders enabled" : "Spaced repetition enabled",
        description: isDaily 
          ? "You'll receive this topic every day" 
          : "Reminders will follow the spaced repetition schedule",
      });

      fetchTopics();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    const tz = prefs?.timezone || getBrowserTimezone();
    return formatInTz(date, tz);
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const todayLabel = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const dueCount = topics.filter((t) => new Date(t.next_revision_date) <= new Date()).length;

  return (
    <AppShell>
      <main className="animate-fade-in">
        <PageHeader
          eyebrow={todayLabel}
          title={greeting}
          subtitle="Your daily learning, speaking, and market intelligence in one place."
        />

        {/* Today 3-tile strip */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          <StatTile
            label="Due Today"
            value={dueCount}
            sublabel={`${topics.length} active topics`}
            tone={dueCount > 0 ? "warning" : "success"}
            icon={<BookOpen className="w-4 h-4" />}
          />
          <StatTile
            label="Streak"
            value={rewards ? Math.max(rewards.current_streak, rewards.topic_streak || 0) : 0}
            sublabel={rewards ? `Best: ${Math.max(rewards.longest_streak, rewards.longest_topic_streak || 0)}d` : "Start today"}
            tone="primary"
            icon={<Flame className="w-4 h-4" />}
          />
          <StatTile
            label="Rank Points"
            value={rewards ? rewards.total_points : 0}
            sublabel={rewards ? rewards.rank : "Unranked"}
            tone="success"
            icon={<Trophy className="w-4 h-4" />}
          />
        </div>

        {user && <AutomationStatus userId={user.id} />}
        {user && <ModelPerformanceCard />}

        <Card className="mb-8 surface-panel border-0">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center">
                <Plus className="w-4 h-4 text-primary" />
              </div>
              Add New Topic
            </CardTitle>
            <CardDescription className="text-xs">
              What did you learn today?
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAddTopic} className="space-y-3.5">
              <div className="space-y-1.5">
                <Label htmlFor="topic" className="text-xs font-medium text-muted-foreground">Topic Title</Label>
                <Input
                  id="topic"
                  placeholder="e.g., Stacks and Queues, String Builder"
                  value={newTopic}
                  onChange={(e) => setNewTopic(e.target.value)}
                  required
                  className="glass-input rounded-xl border-border/50 focus:border-primary/50"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="description" className="text-xs font-medium text-muted-foreground">Notes (Optional)</Label>
                <Textarea
                  id="description"
                  placeholder="Add any notes or key points you want to remember..."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  rows={2}
                  className="glass-input rounded-xl border-border/50 focus:border-primary/50"
                />
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-background/60 border border-border/40">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-accent/15 flex items-center justify-center shrink-0">
                    <RefreshCw className="w-4 h-4 text-accent" />
                  </div>
                  <div>
                    <Label htmlFor="daily-toggle" className="cursor-pointer text-sm font-medium">Daily Reminder</Label>
                    <p className="text-xs text-muted-foreground">Send every day instead of spaced repetition</p>
                  </div>
                </div>
                <Switch
                  id="daily-toggle"
                  checked={newIsDaily}
                  onCheckedChange={setNewIsDaily}
                />
              </div>
              <Button
                type="submit"
                className="w-full rounded-xl glossy-button bg-gradient-to-r from-primary to-secondary hover:opacity-90 transition-all text-primary-foreground font-medium"
                disabled={adding}
              >
                {adding ? "Adding..." : "Add Topic"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* PUBG-style Rewards Widget */}
        {rewards && (
          <Card className="mb-4 surface-panel border-0 overflow-hidden">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-semibold flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-warning" />
                  Your Rewards
                </h3>
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-warning/15 border border-warning/30">
                  <span className="text-sm">{getRankEmoji(rewards.rank)}</span>
                  <span className="font-semibold text-xs text-foreground">{rewards.rank}</span>
                </div>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
                <div className="text-center p-2.5 rounded-xl bg-background/60 border border-border/40">
                  <Star className="w-3.5 h-3.5 mx-auto mb-1 text-warning" />
                  <p className="text-lg font-semibold">{rewards.total_points}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Points</p>
                </div>
                <div className="text-center p-2.5 rounded-xl bg-background/60 border border-border/40">
                  <Flame className="w-3.5 h-3.5 mx-auto mb-1 text-warning" />
                  <p className="text-lg font-semibold">{rewards.current_streak}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Quiz</p>
                </div>
                <div className="text-center p-2.5 rounded-xl bg-background/60 border border-border/40">
                  <BookOpen className="w-3.5 h-3.5 mx-auto mb-1 text-primary" />
                  <p className="text-lg font-semibold">{rewards.topic_streak || 0}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Topic</p>
                </div>
                <div className="text-center p-2.5 rounded-xl bg-background/60 border border-border/40">
                  <Target className="w-3.5 h-3.5 mx-auto mb-1 text-success" />
                  <p className="text-lg font-semibold">{rewards.correct_answers}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Correct</p>
                </div>
                <div className="text-center p-2.5 rounded-xl bg-background/60 border border-border/40">
                  <Trophy className="w-3.5 h-3.5 mx-auto mb-1 text-primary" />
                  <p className="text-lg font-semibold">{rewards.total_quizzes}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Quizzes</p>
                </div>
                <div className="text-center p-2.5 rounded-xl bg-background/60 border border-border/40">
                  <Flame className="w-3.5 h-3.5 mx-auto mb-1 text-destructive" />
                  <p className="text-lg font-semibold">{Math.max(rewards.longest_streak, rewards.longest_topic_streak || 0)}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Best</p>
                </div>
              </div>
              {getNextRank(rewards.rank, rewards.total_points) && (
                <div className="mt-4">
                  <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                    <span>{rewards.rank}</span>
                    <span>{getNextRank(rewards.rank, rewards.total_points)!.name} ({getNextRank(rewards.rank, rewards.total_points)!.minPoints} pts)</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary to-secondary transition-all duration-500"
                      style={{ width: `${getProgressToNextRank(rewards.rank, rewards.total_points)}%` }}
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {user && (
          <div className="mb-4">
            <ReminderSettings userId={user.id} onChange={setPrefs} />
          </div>
        )}

        {/* Quiz Progress Timeline */}
        {quizHistory.length > 0 && (
          <Card className="mb-8 surface-panel border-0">
            <CardContent className="p-0">
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="w-full px-5 py-4 flex items-center justify-between text-left"
              >
                <h3 className="text-sm font-semibold flex items-center gap-2.5">
                  <span className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <History className="w-4 h-4 text-primary" />
                  </span>
                  <span>Quiz Progress Timeline <span className="text-xs font-normal text-muted-foreground">({quizHistory.length})</span></span>
                </h3>
                {showHistory ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </button>

              {showHistory && (
                <div className="px-5 pb-5 border-t border-border/40 pt-4 space-y-3 max-h-[400px] overflow-y-auto">
                  {quizHistory.map((quiz, idx) => {
                    const date = new Date(quiz.answered_at);
                    const prevQuiz = quizHistory[idx + 1];
                    const prevDate = prevQuiz ? new Date(prevQuiz.answered_at).toDateString() : null;
                    const isNewDay = !prevDate || date.toDateString() !== prevDate;

                    return (
                      <div key={quiz.id}>
                        {isNewDay && (
                          <div className="flex items-center gap-2 mt-3 mb-2">
                            <div className="h-px flex-1 bg-border/50" />
                            <span className="text-xs font-medium text-muted-foreground px-2">
                              {date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                            </span>
                            <div className="h-px flex-1 bg-border/50" />
                          </div>
                        )}
                        <div className={`flex items-start gap-3 p-3 rounded-xl border transition-all ${
                          quiz.is_correct 
                            ? 'bg-success/5 border-success/20' 
                            : 'bg-destructive/5 border-destructive/20'
                        }`}>
                          <div className={`mt-0.5 rounded-full p-1 ${
                            quiz.is_correct ? 'bg-success/20' : 'bg-destructive/20'
                          }`}>
                            {quiz.is_correct 
                              ? <CheckCircle2 className="w-4 h-4 text-success" />
                              : <XCircle className="w-4 h-4 text-destructive" />
                            }
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium leading-snug truncate">{quiz.question}</p>
                            {!quiz.is_correct && (
                              <div className="mt-1.5 space-y-0.5">
                                <p className="text-xs text-destructive">
                                  Your answer: <span className="font-medium">{quiz.selected_answer}</span>
                                </p>
                                <p className="text-xs text-success">
                                  Correct: <span className="font-medium">{quiz.correct_answer}</span>
                                </p>
                              </div>
                            )}
                            <div className="flex items-center gap-2 mt-1.5">
                              <span className="text-[10px] text-muted-foreground">
                                {date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                              </span>
                              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                                quiz.is_correct 
                                  ? 'bg-success/10 text-success' 
                                  : 'bg-destructive/10 text-destructive'
                              }`}>
                                {quiz.is_correct ? "+10 pts" : "+2 pts"}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-primary" />
            Your Learning Journey
          </h2>
          
          {loading ? (
            <Card className="surface-panel border-0">
              <CardContent className="py-8 text-center text-muted-foreground">
                <div className="inline-block w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin mb-2" />
                <p className="text-sm">Loading your topics...</p>
              </CardContent>
            </Card>
          ) : topics.length === 0 ? (
            <Card className="surface-panel border-0">
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                No topics yet. Add your first topic above!
              </CardContent>
            </Card>
          ) : (
            topics.map((topic) => (
              <Card key={topic.id} className="surface-panel border-0 transition-shadow hover:shadow-md">
                <CardContent className="py-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex-1 min-w-0">
                      <TruncatedText text={topic.title} maxLength={60} className="font-semibold text-base mb-1 text-foreground" />
                      {topic.description && (
                        <TruncatedText text={topic.description} maxLength={120} />
                      )}
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted/70 px-2.5 py-0.5">
                          <Calendar className="w-3 h-3" />
                          Learned: {formatDate(topic.learned_date)}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2.5 py-0.5 font-medium">
                          <Calendar className="w-3 h-3" />
                          Next: {formatDateTime(topic.next_revision_date)}
                        </span>
                        {topic.is_daily && (
                          <span className="rounded-full bg-accent/15 text-accent px-2.5 py-0.5 font-medium">
                            Daily
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <div className="flex items-center gap-1 mr-1">
                        <Switch
                          checked={topic.is_daily || false}
                          onCheckedChange={(checked) => handleToggleDaily(topic.id, checked)}
                          className="scale-75"
                        />
                        <span className="text-xs text-muted-foreground">Daily</span>
                      </div>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-xl transition-all"
                          >
                            <Info className="w-4 h-4" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-72 glass-card border-border/50" align="end">
                          <div className="space-y-2">
                            <h4 className="font-medium text-sm flex items-center gap-2">
                              <Clock className="w-4 h-4" />
                              Revision Schedule
                            </h4>
                            {topic.is_daily ? (
                              <p className="text-xs text-muted-foreground">
                                Daily mode: You'll receive reminders every day.
                              </p>
                            ) : (
                              <div className="space-y-1">
                                <p className="text-xs text-muted-foreground mb-2">
                                  Your revision schedule:
                                </p>
                                <div className="space-y-1">
                                  {spacedRepetitionIntervals.map((day) => {
                                    const revisionDate = new Date(topic.learned_date);
                                    revisionDate.setDate(revisionDate.getDate() + day);
                                    const isPast = revisionDate < new Date();
                                    const isNext = revisionDate.toDateString() === new Date(topic.next_revision_date).toDateString();
                                    return (
                                      <div
                                        key={day}
                                        className={`px-3 py-1.5 rounded-lg text-sm ${
                                          isNext 
                                            ? 'bg-primary/20 text-primary font-medium' 
                                            : isPast 
                                              ? 'text-muted-foreground line-through' 
                                              : 'text-foreground'
                                        }`}
                                      >
                                        {formatDate(revisionDate.toISOString())}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        </PopoverContent>
                      </Popover>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEditClick(topic)}
                        className="text-primary hover:text-primary hover:bg-primary/10 rounded-xl"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteClick(topic.id)}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10 rounded-xl"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {deletedTopics.length > 0 && (
          <div className="space-y-4 mt-8 animate-fade-in">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold flex items-center gap-2">
                <Archive className="w-5 h-5 text-muted-foreground" />
                Archived Topics ({deletedTopics.length})
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDeleted(!showDeleted)}
                className="hover:bg-muted/50 rounded-xl"
              >
                {showDeleted ? "Hide" : "Show"}
              </Button>
            </div>
            
            {showDeleted && (
              <div className="space-y-4">
                {deletedTopics.map((topic) => (
                  <Card key={topic.id} className="glass-card opacity-60">
                    <CardContent className="py-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <TruncatedText text={topic.title} maxLength={60} className="font-semibold text-lg mb-1 text-foreground" />
                          {topic.description && (
                            <TruncatedText text={topic.description} maxLength={120} />
                          )}
                          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              Deleted: {formatDate(topic.deleted_at!)}
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="glass-card border-border/50">
          <DialogHeader>
            <DialogTitle>Edit Topic</DialogTitle>
            <DialogDescription>
              Update the title and description of your topic.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-title">Topic Title</Label>
              <Input
                id="edit-title"
                placeholder="e.g., Stacks and Queues, String Builder"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Notes (Optional)</Label>
              <Textarea
                id="edit-description"
                placeholder="Add any notes or key points you want to remember..."
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-date">Next Revision Date</Label>
                <Input
                  id="edit-date"
                  type="date"
                  value={editNextRevisionDate}
                  onChange={(e) => setEditNextRevisionDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-time">Time</Label>
                <Input
                  id="edit-time"
                  type="time"
                  value={editNextRevisionTime}
                  onChange={(e) => setEditNextRevisionTime(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleEditSave} disabled={updating}>
              {updating ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will archive the topic and stop all reminders. You can view archived topics later, but they won't appear in your active learning list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
};

export default Dashboard;

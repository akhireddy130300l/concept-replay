import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Brain, LogOut, Plus, Calendar, BookOpen, Trash2, Archive, Pencil, RefreshCw, Clock, Info, Trophy, Flame, Target, Star, ChevronDown, ChevronUp, XCircle, CheckCircle2, History } from "lucide-react";
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
      // Psychology-based spaced repetition: start with 1 day, at user's preferred local time.
      const tz = prefs?.timezone || getBrowserTimezone();
      const hour = prefs?.reminder_hour ?? 9;
      const minute = prefs?.reminder_minute ?? 0;
      const nextRevisionDate = nextRevisionInstant(learnedDate, 1, hour, minute, tz);

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

  return (
    <div className="min-h-screen bg-[image:var(--gradient-hero)]">
      <header className="glass-card sticky top-0 z-10 border-b border-border/30">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-[var(--shadow-button)] animate-glow-pulse">
              <Brain className="w-5 h-5 text-primary-foreground" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight">LearnLoop</h1>
          </div>
          <Button onClick={handleSignOut} variant="outline" size="sm" className="glass-card border-border/50 hover:bg-muted/50">
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-8 animate-fade-in">
          <h2 className="text-3xl font-semibold mb-2 tracking-tight">Welcome back!</h2>
          <p className="text-muted-foreground">
            Add topics you've learned today and we'll remind you to review them.
          </p>
        </div>

        <Card className="mb-8 glass-card float-hover animate-fade-in" style={{ animationDelay: '0.1s' }}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center">
                <Plus className="w-4 h-4 text-primary" />
              </div>
              Add New Topic
            </CardTitle>
            <CardDescription>
              What did you learn today?
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAddTopic} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="topic">Topic Title</Label>
                <Input
                  id="topic"
                  placeholder="e.g., Stacks and Queues, String Builder"
                  value={newTopic}
                  onChange={(e) => setNewTopic(e.target.value)}
                  required
                  className="glass-input border-border/50 focus:border-primary/50"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Notes (Optional)</Label>
                <Textarea
                  id="description"
                  placeholder="Add any notes or key points you want to remember..."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  rows={3}
                  className="glass-input border-border/50 focus:border-primary/50"
                />
              </div>
              <div className="flex items-center justify-between p-4 glass-card rounded-xl border border-border/30">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-accent/20 to-primary/10 flex items-center justify-center">
                    <RefreshCw className="w-4 h-4 text-accent" />
                  </div>
                  <div>
                    <Label htmlFor="daily-toggle" className="cursor-pointer font-medium">Daily Reminder</Label>
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
                className="w-full glossy-button bg-gradient-to-r from-primary to-secondary hover:opacity-90 transition-all text-primary-foreground font-medium"
                disabled={adding}
              >
                {adding ? "Adding..." : "Add Topic"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* PUBG-style Rewards Widget */}
        {rewards && (
          <Card className="glass-card animate-fade-in overflow-hidden" style={{ animationDelay: '0.15s' }}>
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-yellow-500/10" />
              <CardContent className="py-5 relative">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-amber-500" />
                    Your Rewards
                  </h3>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/30">
                    <span className="text-lg">{getRankEmoji(rewards.rank)}</span>
                    <span className="font-bold text-sm text-amber-700 dark:text-amber-300">{rewards.rank}</span>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="text-center p-3 rounded-xl bg-background/60 border border-border/30">
                    <Star className="w-4 h-4 mx-auto mb-1 text-amber-500" />
                    <p className="text-xl font-bold">{rewards.total_points}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Points</p>
                  </div>
                  <div className="text-center p-3 rounded-xl bg-background/60 border border-border/30">
                    <Flame className="w-4 h-4 mx-auto mb-1 text-orange-500" />
                    <p className="text-xl font-bold">{rewards.current_streak}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Quiz Streak</p>
                  </div>
                  <div className="text-center p-3 rounded-xl bg-background/60 border border-border/30">
                    <BookOpen className="w-4 h-4 mx-auto mb-1 text-cyan-500" />
                    <p className="text-xl font-bold">{rewards.topic_streak || 0}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Topic Streak</p>
                  </div>
                  <div className="text-center p-3 rounded-xl bg-background/60 border border-border/30">
                    <Target className="w-4 h-4 mx-auto mb-1 text-green-500" />
                    <p className="text-xl font-bold">{rewards.correct_answers}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Correct</p>
                  </div>
                  <div className="text-center p-3 rounded-xl bg-background/60 border border-border/30">
                    <Trophy className="w-4 h-4 mx-auto mb-1 text-primary" />
                    <p className="text-xl font-bold">{rewards.total_quizzes}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Quizzes</p>
                  </div>
                  <div className="text-center p-3 rounded-xl bg-background/60 border border-border/30">
                    <Flame className="w-4 h-4 mx-auto mb-1 text-rose-500" />
                    <p className="text-xl font-bold">{Math.max(rewards.longest_streak, rewards.longest_topic_streak || 0)}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Best Streak</p>
                  </div>
                </div>
                {/* Progress to next rank */}
                {getNextRank(rewards.rank, rewards.total_points) && (
                  <div className="mt-4">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>{rewards.rank}</span>
                      <span>{getNextRank(rewards.rank, rewards.total_points)!.name} ({getNextRank(rewards.rank, rewards.total_points)!.minPoints} pts)</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-500"
                        style={{ width: `${getProgressToNextRank(rewards.rank, rewards.total_points)}%` }}
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </div>
          </Card>
        )}

        {user && (
          <div className="mt-4">
            <ReminderSettings userId={user.id} onChange={setPrefs} />
          </div>
        )}

        {/* Quiz Progress Timeline */}
        {quizHistory.length > 0 && (
          <Card className="mt-4 mb-4 glass-card animate-fade-in" style={{ animationDelay: '0.18s' }}>
            <CardContent className="py-4">
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="w-full flex items-center justify-between"
              >
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <History className="w-5 h-5 text-primary" />
                  Quiz Progress Timeline
                </h3>
                {showHistory ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
              </button>

              {showHistory && (
                <div className="mt-4 space-y-3 max-h-[400px] overflow-y-auto pr-1">
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
                            ? 'bg-green-500/5 border-green-500/20' 
                            : 'bg-destructive/5 border-destructive/20'
                        }`}>
                          <div className={`mt-0.5 rounded-full p-1 ${
                            quiz.is_correct ? 'bg-green-500/20' : 'bg-destructive/20'
                          }`}>
                            {quiz.is_correct 
                              ? <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
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
                                <p className="text-xs text-green-600 dark:text-green-400">
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
                                  ? 'bg-green-500/10 text-green-600 dark:text-green-400' 
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

        <div className="space-y-4">
          <h3 className="text-xl font-semibold flex items-center gap-2 animate-fade-in" style={{ animationDelay: '0.2s' }}>
            <BookOpen className="w-5 h-5 text-primary" />
            Your Learning Journey
          </h3>
          
          {loading ? (
            <Card className="glass-card animate-fade-in">
              <CardContent className="py-8 text-center text-muted-foreground">
                <div className="inline-block w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin mb-2" />
                <p>Loading your topics...</p>
              </CardContent>
            </Card>
          ) : topics.length === 0 ? (
            <Card className="glass-card animate-fade-in">
              <CardContent className="py-8 text-center text-muted-foreground">
                No topics yet. Add your first topic above!
              </CardContent>
            </Card>
          ) : (
            topics.map((topic, index) => (
              <Card key={topic.id} className="glass-card float-hover animate-fade-in" style={{ animationDelay: `${0.3 + index * 0.05}s` }}>
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
                          Learned: {formatDate(topic.learned_date)}
                        </div>
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          Next Review: {formatDateTime(topic.next_revision_date)}
                        </div>
                        {topic.is_daily && (
                          <span className="glossy-badge px-3 py-1 text-primary rounded-full text-xs font-medium">
                            Daily
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1 mr-2">
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
    </div>
  );
};

export default Dashboard;

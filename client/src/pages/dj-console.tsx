import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { io, type Socket } from "socket.io-client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Volume2,
  VolumeX,
  Check,
  X,
  Trash2,
  PlayCircle,
  Mail,
  Music,
  Clock,
  Users,
} from "lucide-react";

interface Song {
  id: string;
  videoId: string;
  title: string;
  artist?: string;
  duration?: string;
  url: string;
  thumbnail?: string;
  requester: string;
  status: "pending" | "approved" | "rejected" | "playing" | "played";
  submittedAt: string;
  searchQuery?: string;
}

interface PlayerState {
  song: Song | null;
  isPlaying: boolean;
  position: number;
  volume: number;
}

interface QueueStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  played: number;
}

export default function DJConsole() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(75);
  const [position, setPosition] = useState(0);
  const [queue, setQueue] = useState<Song[]>([]);
  const [stats, setStats] = useState<QueueStats>({
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
    played: 0,
  });
  const [connectedListeners, setConnectedListeners] = useState(0);
  const [player, setPlayer] = useState<any>(null);
  const [playerReady, setPlayerReady] = useState(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch initial queue data
  const { data: queueData } = useQuery<{ queue: Song[]; stats: QueueStats }>({
    queryKey: ["/api/queue"],
    refetchInterval: 30000, // Refresh every 30 seconds as fallback
  });

  // Fetch current player state
  const { data: playerData } = useQuery<PlayerState>({
    queryKey: ["/api/player/state"],
    refetchInterval: 5000, // Refresh every 5 seconds as fallback
  });

  // Mutations
  const nextSongMutation = useMutation({
    mutationFn: () =>
      fetch("/api/player/next", { method: "POST" }).then((res) => res.json()),
    onSuccess: () => {
      toast({ title: "Skipped to next song" });
      queryClient.invalidateQueries({ queryKey: ["/api/queue"] });
      queryClient.invalidateQueries({ queryKey: ["/api/player/state"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to skip to next song",
        variant: "destructive",
      });
    },
  });

  const playPauseMutation = useMutation({
    mutationFn: (action: "play" | "pause") =>
      fetch(`/api/player/${action}`, { method: "POST" }).then((res) =>
        res.json(),
      ),
    onSuccess: (_, action) => {
      setIsPlaying(action === "play");
      toast({
        title: action === "play" ? "Playback started" : "Playback paused",
      });
    },
  });

  const volumeMutation = useMutation({
    mutationFn: (newVolume: number) =>
      fetch("/api/player/volume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ volume: newVolume }),
      }).then((res) => res.json()),
    onSuccess: (_, newVolume) => {
      setVolume(newVolume);
    },
  });

  const approveSongMutation = useMutation({
    mutationFn: (songId: string) =>
      fetch(`/api/queue/${songId}/approve`, { method: "POST" }).then((res) =>
        res.json(),
      ),
    onSuccess: (data) => {
      toast({
        title: "Song approved",
        description: `${data.song.title} has been approved`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/queue"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to approve song",
        variant: "destructive",
      });
    },
  });

  const rejectSongMutation = useMutation({
    mutationFn: (songId: string) =>
      fetch(`/api/queue/${songId}/reject`, { method: "POST" }).then((res) =>
        res.json(),
      ),
    onSuccess: (data) => {
      toast({
        title: "Song rejected",
        description: `${data.song.title} has been rejected`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/queue"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to reject song",
        variant: "destructive",
      });
    },
  });

  const playNextMutation = useMutation({
    mutationFn: (songId: string) =>
      fetch(`/api/queue/${songId}/play-next`, { method: "POST" }).then((res) =>
        res.json(),
      ),
    onSuccess: (data) => {
      toast({
        title: "Now playing",
        description: `${data.song.title}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/queue"] });
      queryClient.invalidateQueries({ queryKey: ["/api/player/state"] });
    },
  });

  // Initialize YouTube Player
  useEffect(() => {
    // Load YouTube IFrame API
    if (!(window as any).YT || !(window as any).YT.Player) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName("script")[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

      (window as any).onYouTubeIframeAPIReady = () => {
        console.log("YouTube API ready, creating player");
        const ytPlayer = new (window as any).YT.Player("youtube-player", {
          height: "360",
          width: "640",
          videoId: currentSong?.videoId || "dQw4w9WgXcQ", // Default video
          playerVars: {
            autoplay: 0,
            controls: 1,
            disablekb: 0,
            enablejsapi: 1,
            modestbranding: 1,
            rel: 0,
            showinfo: 0,
            fs: 0,
          },
          events: {
            onReady: (event: any) => {
              console.log("YouTube player ready");
              setPlayer(event.target);
              setPlayerReady(true);
              event.target.setVolume(volume);
            },
            onStateChange: (event: any) => {
              console.log("Player state changed:", event.data);
              if (event.data === (window as any).YT.PlayerState.ENDED) {
                handleNext();
              } else if (
                event.data === (window as any).YT.PlayerState.PLAYING
              ) {
                setIsPlaying(true);
              } else if (event.data === (window as any).YT.PlayerState.PAUSED) {
                setIsPlaying(false);
              }
            },
            onError: (event: any) => {
              console.error("YouTube player error:", event.data);
            },
          },
        });
      };
    } else if ((window as any).YT && (window as any).YT.Player && !player) {
      // API already loaded, create player directly
      console.log("YouTube API already loaded, creating player");
      const ytPlayer = new (window as any).YT.Player("youtube-player", {
        height: "360",
        width: "640",
        videoId: currentSong?.videoId || "dQw4w9WgXcQ",
        playerVars: {
          autoplay: 0,
          controls: 1,
          disablekb: 0,
          enablejsapi: 1,
          modestbranding: 1,
          rel: 0,
          showinfo: 0,
          fs: 0,
        },
        events: {
          onReady: (event: any) => {
            console.log("YouTube player ready");
            setPlayer(event.target);
            event.target.setVolume(volume);
          },
          onStateChange: (event: any) => {
            console.log("Player state changed:", event.data);
            if (event.data === (window as any).YT.PlayerState.ENDED) {
              handleNext();
            } else if (event.data === (window as any).YT.PlayerState.PLAYING) {
              setIsPlaying(true);
            } else if (event.data === (window as any).YT.PlayerState.PAUSED) {
              setIsPlaying(false);
            }
          },
          onError: (event: any) => {
            console.error("YouTube player error:", event.data);
          },
        },
      });
    }
  }, [currentSong?.videoId, volume]);

  // Initialize Socket.IO connection
  useEffect(() => {
    const newSocket = io({
      transports: ["polling"], // Use polling only to avoid WebSocket issues
      timeout: 20000,
      forceNew: true,
      upgrade: false, // Prevent upgrading to WebSocket
    });
    setSocket(newSocket);

    newSocket.on("connect", () => {
      console.log("Connected to DJ server");
      toast({ title: "Connected to DJ server" });
    });

    newSocket.on("disconnect", () => {
      console.log("Disconnected from DJ server");
      toast({
        title: "Disconnected",
        description: "Connection to server lost",
        variant: "destructive",
      });
    });

    // Real-time queue updates
    newSocket.on("queue-update", (data: { queue: Song[] }) => {
      setQueue(data.queue);

      // Update stats
      const newStats = {
        total: data.queue.length,
        pending: data.queue.filter((s) => s.status === "pending").length,
        approved: data.queue.filter((s) => s.status === "approved").length,
        rejected: data.queue.filter((s) => s.status === "rejected").length,
        played: data.queue.filter((s) => s.status === "played").length,
      };
      setStats(newStats);

      queryClient.invalidateQueries({ queryKey: ["/api/queue"] });
    });

    // Real-time now playing updates
    newSocket.on("now-playing", (data: PlayerState) => {
      console.log("Now playing update:", data);
      setCurrentSong(data.song);
      setIsPlaying(data.isPlaying);
      setPosition(data.position);

      // Load video in YouTube player when song changes
      if (player && data.song && data.song.videoId) {
        console.log("Loading video from socket update:", data.song.videoId);
        player.loadVideoById(data.song.videoId);
        if (data.isPlaying) {
          setTimeout(() => {
            player.playVideo();
          }, 1000);
        }
      }

      queryClient.invalidateQueries({ queryKey: ["/api/player/state"] });
    });

    // Volume updates
    newSocket.on("volume-change", (data: { volume: number }) => {
      setVolume(data.volume);
    });

    // Playback state updates
    newSocket.on("playback-state", (data: PlayerState) => {
      setIsPlaying(data.isPlaying);
      setPosition(data.position);
    });

    // Notifications
    newSocket.on(
      "notification",
      (data: { type: string; message: string; song?: Song }) => {
        toast({
          title: "New Request",
          description: data.message,
        });
      },
    );

    // Request current state
    newSocket.emit("get-current-state");

    return () => {
      newSocket.close();
    };
  }, [toast, queryClient]);

  // Update data from queries
  useEffect(() => {
    if (queueData) {
      setQueue(queueData.queue);
      setStats(queueData.stats);
    }
  }, [queueData]);

  useEffect(() => {
    if (playerData) {
      setCurrentSong(playerData.song);
      setIsPlaying(playerData.isPlaying);
      setPosition(playerData.position);
      setVolume(playerData.volume);
    }
  }, [playerData]);

  // Simulate connected listeners (would be real data from server)
  useEffect(() => {
    const interval = setInterval(() => {
      setConnectedListeners(Math.floor(Math.random() * 20) + 5);
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const handlePlayPause = () => {
    console.log(
      "Play/Pause clicked. Player:",
      !!player,
      "Current song:",
      !!currentSong,
      "Is playing:",
      isPlaying,
    );

    if (player && currentSong) {
      if (isPlaying) {
        console.log("Pausing video");
        player.pauseVideo();
        setIsPlaying(false);
      } else {
        console.log("Playing video");
        player.playVideo();
        setIsPlaying(true);
      }
    } else if (player && !currentSong) {
      // Test with a default video if no current song
      console.log("No current song, loading test video");
      player.loadVideoById("dQw4w9WgXcQ");
      setTimeout(() => {
        player.playVideo();
        setIsPlaying(true);
      }, 1000);
    }

    playPauseMutation.mutate(isPlaying ? "pause" : "play");
  };

  const handleNext = () => {
    nextSongMutation.mutate();
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVolume = parseInt(e.target.value);
    if (player) {
      player.setVolume(newVolume);
    }
    volumeMutation.mutate(newVolume);
  };

  // Update YouTube player when current song changes
  useEffect(() => {
    if (player && currentSong && currentSong.videoId) {
      console.log("Loading video:", currentSong.videoId, currentSong.title);
      player.loadVideoById(currentSong.videoId);
      // Auto-play when song changes and is approved
      if (currentSong.status === "playing") {
        setTimeout(() => {
          player.playVideo();
          setIsPlaying(true);
        }, 1000);
      }
    }
  }, [currentSong, player]);

  // Update YouTube player volume
  useEffect(() => {
    if (player) {
      player.setVolume(volume);
    }
  }, [volume, player]);

  // Track position for progress bar
  useEffect(() => {
    if (player && isPlaying) {
      const interval = setInterval(() => {
        if (player.getCurrentTime) {
          const currentTime = Math.floor(player.getCurrentTime());
          setPosition(currentTime);
        }
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [player, isPlaying]);

  const handleApprove = (songId: string) => {
    approveSongMutation.mutate(songId);
  };

  const handleReject = (songId: string) => {
    rejectSongMutation.mutate(songId);
  };

  const handlePlayNext = (songId: string) => {
    playNextMutation.mutate(songId);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} min ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return (
          <Badge
            variant="outline"
            className="bg-amber-50 text-amber-700 border-amber-200"
          >
            <Clock className="w-3 h-3 mr-1" />
            Pending
          </Badge>
        );
      case "approved":
        return (
          <Badge
            variant="outline"
            className="bg-green-50 text-green-700 border-green-200"
          >
            <Check className="w-3 h-3 mr-1" />
            Approved
          </Badge>
        );
      case "rejected":
        return (
          <Badge
            variant="outline"
            className="bg-red-50 text-red-700 border-red-200"
          >
            <X className="w-3 h-3 mr-1" />
            Rejected
          </Badge>
        );
      case "playing":
        return (
          <Badge
            variant="outline"
            className="bg-blue-50 text-blue-700 border-blue-200"
          >
            <PlayCircle className="w-3 h-3 mr-1" />
            Playing
          </Badge>
        );
      case "played":
        return (
          <Badge
            variant="outline"
            className="bg-slate-50 text-slate-700 border-slate-200"
          >
            <Check className="w-3 h-3 mr-1" />
            Played
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const emailAddress =
    import.meta.env.VITE_DJ_INBOUND_ADDRESS ||
    "ea627828ee2287bf174a69cbb9a3396e@inbound.postmarkapp.com";

  return (
    <div className="min-h-screen bg-slate-50">
      {/* YouTube Player */}
      <div
        style={{ display: "none" }}
        className="fixed bottom-4 right-4 z-50 bg-black rounded-lg shadow-lg"
      >
        <div id="youtube-player"></div>
        {playerReady && (
          <div className="absolute top-2 left-2 bg-green-500 text-white text-xs px-2 py-1 rounded">
            Player Ready
          </div>
        )}
        {!playerReady && (
          <div className="absolute top-2 left-2 bg-yellow-500 text-white text-xs px-2 py-1 rounded">
            Loading...
          </div>
        )}
      </div>

      {/* Email Ticker */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white py-3 overflow-hidden relative">
        <span className="text-lg font-medium px-8">
          <Mail className="inline w-5 h-5 mr-2" />
          📧 Email your song requests to:
          <strong
            className="bg-white/20 px-3 py-1 rounded-md font-mono cursor-pointer hover:bg-white/30 transition-colors mx-2"
            onClick={() => (window.location.href = `mailto:${emailAddress}`)}
          >
            {emailAddress}
          </strong>
          - Send YouTube links or song names! 🎵
        </span>

        {/* Live indicator */}
        {/* <div className="absolute top-3 right-4 flex items-center space-x-2">
          <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
          <span className="text-sm font-medium">
            <Users className="inline w-4 h-4 mr-1" />
            {connectedListeners} listeners connected
          </span>
        </div> */}
      </div>

      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Music Player Section */}
          <div className="lg:col-span-1">
            <Card className="sticky top-8">
              <CardContent className="p-6">
                <div className="text-center mb-6">
                  <h2 className="text-2xl font-bold text-slate-900 mb-2">
                    Now Playing
                  </h2>
                  <div className="h-1 w-16 bg-gradient-to-r from-blue-600 to-blue-700 rounded mx-auto"></div>
                </div>

                {/* Current Song Display */}
                <div className="bg-slate-50 rounded-lg p-4 mb-6">
                  {currentSong ? (
                    <div className="flex items-center space-x-4">
                      <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center text-white text-2xl">
                        {currentSong.thumbnail ? (
                          <img
                            src={currentSong.thumbnail}
                            alt="Album art"
                            className="w-16 h-16 rounded-lg object-cover"
                          />
                        ) : (
                          <Music className="w-8 h-8" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-slate-900 truncate">
                          {currentSong.title}
                        </h3>
                        <p className="text-sm text-slate-600 truncate">
                          {currentSong.artist || "Unknown Artist"}
                        </p>
                        <p className="text-xs text-slate-500">
                          Requested by: {currentSong.requester}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <Music className="w-12 h-12 text-slate-400 mx-auto mb-2" />
                      <p className="text-slate-500">No song playing</p>
                    </div>
                  )}

                  {/* Progress Bar */}
                  {currentSong && (
                    <div className="mt-4">
                      <div className="flex justify-between text-xs text-slate-500 mb-1">
                        <span>{formatTime(position)}</span>
                        <span>{currentSong.duration || "0:00"}</span>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${(position / 180) * 100}%` }}
                        ></div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Player Controls */}
                <div className="flex justify-center space-x-4 mb-6">
                  <Button
                    variant="outline"
                    size="icon"
                    className="w-12 h-12 rounded-full"
                    disabled
                  >
                    <SkipBack className="w-5 h-5" />
                  </Button>

                  <Button
                    size="icon"
                    className="w-16 h-16 rounded-full"
                    onClick={handlePlayPause}
                    disabled={playPauseMutation.isPending}
                  >
                    {isPlaying ? (
                      <Pause className="w-6 h-6" />
                    ) : (
                      <Play className="w-6 h-6" />
                    )}
                  </Button>

                  <Button
                    variant="outline"
                    size="icon"
                    className="w-12 h-12 rounded-full"
                    onClick={handleNext}
                    disabled={nextSongMutation.isPending}
                  >
                    <SkipForward className="w-5 h-5" />
                  </Button>
                </div>

                {/* Volume Control */}
                <div className="flex items-center space-x-3">
                  {volume === 0 ? (
                    <VolumeX className="w-5 h-5 text-slate-600" />
                  ) : (
                    <Volume2 className="w-5 h-5 text-slate-600" />
                  )}
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={volume}
                    onChange={handleVolumeChange}
                    className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer slider"
                  />
                  <span className="text-sm text-slate-600 w-8">{volume}</span>
                </div>

                {/* Test Player Button (only when no song is playing) */}
                {/* {playerReady && !currentSong && (
                  <div className="mt-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        console.log("Testing YouTube player with Rick Roll");
                        player.loadVideoById("dQw4w9WgXcQ");
                        setTimeout(() => {
                          player.playVideo();
                          setIsPlaying(true);
                        }, 1000);
                      }}
                      className="w-full bg-red-600 hover:bg-red-700 text-white border-red-600"
                    >
                      <Play className="w-4 h-4 mr-2" />
                      Test YouTube Player
                    </Button>
                  </div>
                )} */}

                {/* Queue Stats */}
                <div className="mt-6 pt-6 border-t border-slate-200">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <div className="text-2xl font-bold text-amber-600">
                        {stats.pending}
                      </div>
                      <div className="text-xs text-slate-600">Pending</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-green-600">
                        {stats.approved}
                      </div>
                      <div className="text-xs text-slate-600">Approved</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-red-600">
                        {stats.rejected}
                      </div>
                      <div className="text-xs text-slate-600">Rejected</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Queue Management Section */}
          <div className="lg:col-span-2">
            <Card>
              {/* Queue Header */}
              <div className="bg-slate-900 text-white p-6 rounded-t-lg">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-2xl font-bold">Song Queue</h2>
                  <div className="flex items-center space-x-4">
                    <div className="text-sm bg-white/10 px-3 py-1 rounded-md">
                      <Clock className="inline w-4 h-4 mr-1" />
                      {stats.total} total requests
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-700 border-blue-600 text-white"
                      onClick={() =>
                        queryClient.invalidateQueries({
                          queryKey: ["/api/queue"],
                        })
                      }
                    >
                      Refresh
                    </Button>
                  </div>
                </div>
              </div>

              <CardContent className="p-0">
                {/* Queue Table */}
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="text-left p-4 font-semibold text-slate-700">
                          Song
                        </th>
                        <th className="text-center p-4 font-semibold text-slate-700">
                          Status
                        </th>
                        <th className="text-center p-4 font-semibold text-slate-700">
                          Actions
                        </th>

                        <th className="text-center p-4 font-semibold text-slate-700">
                          Duration
                        </th>
                        <th className="text-left p-4 font-semibold text-slate-700">
                          Requester
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {queue.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="text-center py-12">
                            <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                              <Music className="w-8 h-8 text-slate-400" />
                            </div>
                            <h3 className="text-lg font-semibold text-slate-900 mb-2">
                              No songs in queue
                            </h3>
                            <p className="text-slate-600 mb-4">
                              Share the email address above to start receiving
                              song requests!
                            </p>
                          </td>
                        </tr>
                      ) : (
                        queue.map((song) => (
                          <tr
                            key={song.id}
                            className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                          >
                            <td className="p-4">
                              <div className="flex items-center space-x-3">
                                <div className="w-12 h-12 bg-gradient-to-br from-red-500 to-pink-600 rounded-lg flex items-center justify-center text-white">
                                  {song.thumbnail ? (
                                    <img
                                      src={song.thumbnail}
                                      alt="Song thumbnail"
                                      className="w-12 h-12 rounded-lg object-cover"
                                    />
                                  ) : (
                                    <Music className="w-6 h-6" />
                                  )}
                                </div>
                                <div>
                                  <h4 className="font-semibold text-slate-900 truncate max-w-xs">
                                    {song.title}
                                  </h4>
                                  <p className="text-sm text-slate-600 truncate max-w-xs">
                                    {song.artist || "Unknown Artist"}
                                  </p>
                                  <p className="text-xs text-slate-500">
                                    {formatTimeAgo(song.submittedAt)}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="p-4 text-center">
                              {getStatusBadge(song.status)}
                            </td>

                            <td className="p-4 text-center">
                              <div className="flex justify-center space-x-2">
                                {song.status === "pending" && (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="bg-green-50 hover:bg-green-100 text-green-700 border-green-200"
                                      onClick={() => handleApprove(song.id)}
                                      disabled={approveSongMutation.isPending}
                                    >
                                      <Check className="w-4 h-4" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="bg-red-50 hover:bg-red-100 text-red-700 border-red-200"
                                      onClick={() => handleReject(song.id)}
                                      disabled={rejectSongMutation.isPending}
                                    >
                                      <X className="w-4 h-4" />
                                    </Button>
                                  </>
                                )}
                                {song.status === "approved" && (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200"
                                      onClick={() => handlePlayNext(song.id)}
                                      disabled={playNextMutation.isPending}
                                    >
                                      <PlayCircle className="w-4 h-4" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200"
                                      onClick={() => handleReject(song.id)}
                                      disabled={rejectSongMutation.isPending}
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </>
                                )}
                                {(song.status === "rejected" ||
                                  song.status === "played") && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200"
                                    onClick={() => handleApprove(song.id)}
                                    disabled={approveSongMutation.isPending}
                                  >
                                    <Check className="w-4 h-4" />
                                  </Button>
                                )}
                              </div>
                            </td>
                            <td className="p-4 text-center">
                              <span className="text-sm font-mono text-slate-700">
                                {song.duration || "Unknown"}
                              </span>
                            </td>
                            <td className="p-4">
                              <div className="text-sm font-medium text-slate-900 truncate max-w-xs">
                                {song.requester}
                              </div>
                              {song.searchQuery && (
                                <div className="text-xs text-slate-500">
                                  Search: "{song.searchQuery}"
                                </div>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Hidden YouTube iframe for audio playback */}
      <iframe
        id="youtube-player"
        src="about:blank"
        style={{ display: "none" }}
        title="YouTube Player"
      />

      {/* Connection Status */}
      <div className="fixed bottom-4 right-4 z-50">
        <Card className="p-3">
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-sm font-medium text-slate-700">
              Connected
            </span>
          </div>
        </Card>
      </div>
    </div>
  );
}

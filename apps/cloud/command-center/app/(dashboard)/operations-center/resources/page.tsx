"use client";

import { useState } from "react";
import { 
  Users, Plane, Hotel, Calendar, Search, MapPin, CheckCircle, Clock,
  Filter, Plus, ShieldAlert, BadgeInfo, Mail, Phone, ChevronRight, UserPlus, Info
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { motion, AnimatePresence } from "framer-motion";

interface CrewMember {
  id: string;
  name: string;
  role: string;
  status: "ACTIVE" | "STANDBY" | "TRAVEL" | "OFF_DUTY";
  avatar: string;
  contact: { email: string; phone: string };
  assignedEvent: string;
  itinerary?: {
    flight: string;
    airline: string;
    departs: string;
    hotelName: string;
    roomStatus: "BOOKED" | "CHECKED_IN" | "PENDING";
  };
}

const mockCrew: CrewMember[] = [
  {
    id: "CR-09",
    name: "Alex Rivera",
    role: "Lead Network Engineer",
    status: "ACTIVE",
    avatar: "AR",
    contact: { email: "alex.r@eventos.ops", phone: "+1 (555) 234-9011" },
    assignedEvent: "GTS 2026 Keynote & Exhibition",
    itinerary: {
      flight: "AA-2041",
      airline: "American Airlines",
      departs: "June 22, 10:30 AM",
      hotelName: "Hyatt Regency Center Room 408",
      roomStatus: "CHECKED_IN"
    }
  },
  {
    id: "CR-12",
    name: "Marcus Chen",
    role: "A/V Technical Director",
    status: "TRAVEL",
    avatar: "MC",
    contact: { email: "marcus.c@eventos.ops", phone: "+1 (555) 456-1188" },
    assignedEvent: "GTS 2026 Keynote & Exhibition",
    itinerary: {
      flight: "UA-993",
      airline: "United Airlines",
      departs: "June 23, 03:15 PM",
      hotelName: "Hilton Conference Center Suite 902",
      roomStatus: "BOOKED"
    }
  },
  {
    id: "CR-15",
    name: "Sarah Connor",
    role: "A/V Rigging Specialist",
    status: "STANDBY",
    avatar: "SC",
    contact: { email: "sarah.c@eventos.ops", phone: "+1 (555) 789-2231" },
    assignedEvent: "MedTech Annual Expo"
  },
  {
    id: "CR-18",
    name: "Devon Patel",
    role: "Streaming & RTMP Broadcast Specialist",
    status: "ACTIVE",
    avatar: "DP",
    contact: { email: "devon.p@eventos.ops", phone: "+1 (555) 890-4455" },
    assignedEvent: "AI Synergy Expo 2026",
    itinerary: {
      flight: "DL-1044",
      airline: "Delta Air Lines",
      departs: "June 21, 08:00 AM",
      hotelName: "Radisson Blu Expo Plaza Room 104",
      roomStatus: "CHECKED_IN"
    }
  },
  {
    id: "CR-21",
    name: "Jessica Vance",
    role: "Lead Digital Signage Admin",
    status: "OFF_DUTY",
    avatar: "JV",
    contact: { email: "jess.v@eventos.ops", phone: "+1 (555) 345-7766" },
    assignedEvent: "None"
  }
];

export default function CrewResources() {
  const [crew, setCrew] = useState<CrewMember[]>(mockCrew);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [selectedCrewId, setSelectedCrewId] = useState<string>("CR-09");

  const filteredCrew = crew.filter(c => {
    const matchesSearch = 
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      c.role.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.assignedEvent.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (statusFilter === "ALL") return matchesSearch;
    return matchesSearch && c.status === statusFilter;
  });

  const selectedCrew = crew.find(c => c.id === selectedCrewId) || crew[0];

  const toggleRoomCheckIn = (crewId: string) => {
    setCrew(prev => prev.map(c => {
      if (c.id === crewId && c.itinerary) {
        const currentStatus = c.itinerary.roomStatus;
        const nextStatus: Record<"BOOKED" | "CHECKED_IN" | "PENDING", "BOOKED" | "CHECKED_IN" | "PENDING"> = {
          "BOOKED": "CHECKED_IN",
          "CHECKED_IN": "PENDING",
          "PENDING": "BOOKED"
        };
        return {
          ...c,
          itinerary: {
            ...c.itinerary,
            roomStatus: nextStatus[currentStatus]
          }
        };
      }
      return c;
    }));
  };

  const getStatusBadge = (status: CrewMember["status"]) => {
    const maps = {
      ACTIVE: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
      STANDBY: "bg-blue-500/10 text-blue-400 border-blue-500/20",
      TRAVEL: "bg-amber-500/10 text-amber-400 border-amber-500/20",
      OFF_DUTY: "bg-zinc-800 text-zinc-500"
    };
    return maps[status];
  };

  return (
    <div className="space-y-6 p-8 pb-16 overflow-y-auto h-full custom-scrollbar">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl font-black tracking-tight text-white">
            Crew <span className="bg-gradient-to-r from-teal-400 to-emerald-500 bg-clip-text text-transparent">Scheduler</span>
          </h1>
          <p className="text-zinc-400 text-sm">
            Manage worker shifts, logistics deployment states, and vendor travel itineraries.
          </p>
        </div>
        <div>
          <Button className="bg-emerald-500 text-white hover:bg-emerald-600 flex items-center gap-1.5 text-xs py-1.5 h-9">
            <UserPlus className="h-4 w-4" /> Add Crew Member
          </Button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="border-zinc-800 bg-zinc-950/40 p-6 flex flex-col justify-between h-28">
          <span className="text-zinc-500 text-[10px] font-black uppercase tracking-wider">Total Crew Pool</span>
          <div className="space-y-1">
            <div className="text-2xl font-black text-white">{crew.length} Operators</div>
            <p className="text-[10px] text-zinc-500">18 total external subcontractors</p>
          </div>
        </Card>
        <Card className="border-zinc-800 bg-zinc-950/40 p-6 flex flex-col justify-between h-28">
          <span className="text-zinc-500 text-[10px] font-black uppercase tracking-wider">Active Shifts</span>
          <div className="space-y-1">
            <div className="text-2xl font-black text-emerald-400">
              {crew.filter(c => c.status === "ACTIVE").length} On-Site
            </div>
            <p className="text-[10px] text-zinc-500">Actively logged into active stage setups</p>
          </div>
        </Card>
        <Card className="border-zinc-800 bg-zinc-950/40 p-6 flex flex-col justify-between h-28">
          <span className="text-zinc-500 text-[10px] font-black uppercase tracking-wider">In Transit</span>
          <div className="space-y-1">
            <div className="text-2xl font-black text-amber-400">
              {crew.filter(c => c.status === "TRAVEL").length} Travelling
            </div>
            <p className="text-[10px] text-zinc-500">Awaiting check-ins at hotels</p>
          </div>
        </Card>
        <Card className="border-zinc-800 bg-zinc-950/40 p-6 flex flex-col justify-between h-28">
          <span className="text-zinc-500 text-[10px] font-black uppercase tracking-wider">Standby Readiness</span>
          <div className="space-y-1">
            <div className="text-2xl font-black text-blue-400">
              {crew.filter(c => c.status === "STANDBY").length} Standby
            </div>
            <p className="text-[10px] text-zinc-500">Ready to deploy on backup escalation</p>
          </div>
        </Card>
      </div>

      {/* Main Grid splitting search/list and detail booking pane */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
        {/* Left Side: Crew Roster and Search (5 cols) */}
        <div className="xl:col-span-5 space-y-4">
          <Card className="border-zinc-800 bg-zinc-950/40 backdrop-blur-md">
            <CardHeader className="pb-3 border-b border-zinc-900">
              <CardTitle className="text-sm font-black uppercase tracking-wider text-zinc-300">Staff Dispatch Console</CardTitle>
              <div className="relative mt-3">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
                <Input
                  placeholder="Search crew, skills..."
                  className="pl-9 bg-zinc-900/60 border-zinc-800 text-xs text-white"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="flex gap-2 mt-2 overflow-x-auto no-scrollbar">
                {["ALL", "ACTIVE", "TRAVEL", "STANDBY", "OFF_DUTY"].map(st => (
                  <button
                    key={st}
                    onClick={() => setStatusFilter(st)}
                    className={`text-[10px] font-extrabold uppercase px-2.5 py-1 rounded-md transition-all whitespace-nowrap ${
                      statusFilter === st 
                        ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" 
                        : "bg-zinc-900/30 text-zinc-500 border border-transparent hover:text-zinc-300"
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="p-0 max-h-[500px] overflow-y-auto custom-scrollbar">
              <div className="divide-y divide-zinc-900/50">
                {filteredCrew.map(member => {
                  const isSelected = member.id === selectedCrewId;
                  return (
                    <div
                      key={member.id}
                      onClick={() => setSelectedCrewId(member.id)}
                      className={`p-4 flex items-center justify-between gap-3 cursor-pointer transition-all ${
                        isSelected 
                          ? "bg-zinc-900/60 border-l-2 border-emerald-500" 
                          : "hover:bg-zinc-900/20 border-l-2 border-transparent"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center font-bold text-xs text-zinc-200 uppercase">
                          {member.avatar}
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-zinc-200">{member.name}</h4>
                          <p className="text-[11px] text-zinc-500 font-medium">{member.role}</p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1.5">
                        <span className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full border ${getStatusBadge(member.status)}`}>
                          {member.status}
                        </span>
                        <span className="text-[10px] text-zinc-500 truncate max-w-[120px] font-mono">{member.assignedEvent}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Side: Crew Details & Itinerary (7 cols) */}
        <div className="xl:col-span-7 space-y-6">
          <Card className="border-zinc-800 bg-zinc-950/40 backdrop-blur-md">
            <CardHeader className="pb-4 border-b border-zinc-900">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-black uppercase tracking-wider text-zinc-400">logistics & travel dashboard</CardTitle>
                  <CardDescription className="text-xs text-zinc-500 mt-1">Review flights, hotels, and schedule allocations.</CardDescription>
                </div>
                <span className="font-mono text-xs font-black text-emerald-400">{selectedCrew.id}</span>
              </div>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              {/* Member Basic Profile info */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-zinc-900/30 border border-zinc-900">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center font-black text-sm text-emerald-400">
                    {selectedCrew.avatar}
                  </div>
                  <div className="space-y-0.5">
                    <h3 className="text-sm font-black text-zinc-200">{selectedCrew.name}</h3>
                    <p className="text-xs text-zinc-500 font-medium">{selectedCrew.role}</p>
                  </div>
                </div>
                <div className="space-y-1 sm:text-right">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase block">Duty Assignment</span>
                  <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-mono">
                    {selectedCrew.assignedEvent}
                  </Badge>
                </div>
              </div>

              {/* Contact info grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-3 rounded-lg bg-zinc-900/20 border border-zinc-900 flex items-center gap-3">
                  <Mail className="h-4 w-4 text-emerald-400" />
                  <div className="space-y-0.5">
                    <span className="text-[9px] text-zinc-500 font-bold uppercase">Email Address</span>
                    <p className="text-xs font-semibold text-zinc-300">{selectedCrew.contact.email}</p>
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-zinc-900/20 border border-zinc-900 flex items-center gap-3">
                  <Phone className="h-4 w-4 text-emerald-400" />
                  <div className="space-y-0.5">
                    <span className="text-[9px] text-zinc-500 font-bold uppercase">Emergency Phone</span>
                    <p className="text-xs font-semibold text-zinc-300">{selectedCrew.contact.phone}</p>
                  </div>
                </div>
              </div>

              {/* Travel Booking Details Section */}
              <div className="space-y-4">
                <h3 className="text-xs font-black uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                  <Plane className="h-4 w-4 text-emerald-400" /> Flight & Hotel Bookings
                </h3>

                {selectedCrew.itinerary ? (
                  <div className="space-y-4">
                    {/* Flight Detail */}
                    <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800/40 space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-zinc-300">Flight {selectedCrew.itinerary.flight}</span>
                        <Badge className="bg-zinc-800 text-zinc-400">{selectedCrew.itinerary.airline}</Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-4 pt-2 border-t border-zinc-900/50 text-xs">
                        <div className="space-y-0.5">
                          <span className="text-[9px] text-zinc-500 font-bold uppercase">Departs</span>
                          <p className="font-bold text-zinc-200">{selectedCrew.itinerary.departs}</p>
                        </div>
                        <div className="space-y-0.5">
                          <span className="text-[9px] text-zinc-500 font-bold uppercase">Flight Status</span>
                          <p className="font-bold text-emerald-400 flex items-center gap-1">Confirmed</p>
                        </div>
                      </div>
                    </div>

                    {/* Hotel Detail */}
                    <div className="p-4 rounded-xl bg-zinc-900/40 border border-zinc-800/40 space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-zinc-300 flex items-center gap-1.5"><Hotel className="h-4 w-4 text-emerald-400" /> Hotel Accommodation</span>
                        <button 
                          onClick={() => toggleRoomCheckIn(selectedCrew.id)}
                          className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full border transition-all ${
                            selectedCrew.itinerary.roomStatus === "CHECKED_IN" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                            selectedCrew.itinerary.roomStatus === "PENDING" ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20" :
                            "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                          }`}
                        >
                          {selectedCrew.itinerary.roomStatus}
                        </button>
                      </div>
                      <div className="pt-2 border-t border-zinc-900/50 text-xs">
                        <span className="text-[9px] text-zinc-500 font-bold uppercase">Vendor Reservation</span>
                        <p className="font-bold text-zinc-200 mt-0.5">{selectedCrew.itinerary.hotelName}</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-6 rounded-xl border border-dashed border-zinc-800 bg-zinc-900/10 flex flex-col items-center justify-center text-center space-y-2">
                    <Info className="h-5 w-5 text-zinc-500" />
                    <p className="text-xs text-zinc-500 font-medium">No active travel bookings assigned to this crew member.</p>
                    <Button variant="outline" className="border-zinc-800 bg-zinc-900/40 text-xs h-8 text-zinc-400 hover:text-white">
                      Create Itinerary
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
            <CardFooter className="border-t border-zinc-900 pt-4 flex justify-between items-center text-[10px] text-zinc-500">
              <span className="flex items-center gap-1"><BadgeInfo className="h-3.5 w-3.5 text-emerald-400" /> Flight tracking logs sync automatically every 10 mins.</span>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}

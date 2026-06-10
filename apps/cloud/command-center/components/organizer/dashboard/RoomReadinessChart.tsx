
"use client";

import { 
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, 
  CartesianGrid, Tooltip, Cell 
} from 'recharts';

interface RoomData {
  room_name: string;
  readiness_pct: number;
}

interface RoomReadinessChartProps {
  data: RoomData[];
}

export function RoomReadinessChart({ data }: RoomReadinessChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted uppercase text-[10px] font-black tracking-widest border border-dashed border-default rounded-3xl">
        Scanning venues...
      </div>
    );
  }

  // Sort by readiness descending
  const sortedData = [...data].sort((a, b) => b.readiness_pct - a.readiness_pct);

  return (
    <div className="h-[350px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={sortedData} layout="vertical" margin={{ top: 0, right: 30, left: 40, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="rgba(255,255,255,0.05)" />
          <XAxis 
            type="number" 
            domain={[0, 100]} 
            axisLine={false} 
            tickLine={false} 
            tick={{ fontSize: 10, fontWeight: 900, fill: 'var(--muted)' }} 
          />
          <YAxis 
            dataKey="room_name" 
            type="category" 
            axisLine={false} 
            tickLine={false} 
            width={100}
            tick={{ fontSize: 10, fontWeight: 900, fill: 'var(--text)', letterSpacing: '0.05em' }}
          />
          <Tooltip 
            cursor={{ fill: 'rgba(255,255,255,0.02)' }}
            contentStyle={{ 
              backgroundColor: 'rgba(23, 23, 23, 0.8)', 
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '16px',
              boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
              fontSize: '11px',
              fontWeight: 900
            }}
          />
          <Bar 
            dataKey="readiness_pct" 
            radius={[0, 10, 10, 0]} 
            barSize={20}
            animationDuration={1500}
          >
            {sortedData.map((entry, index) => (
              <Cell 
                key={`cell-${index}`} 
                fill={entry.readiness_pct === 100 ? 'var(--success)' : entry.readiness_pct > 50 ? 'var(--pri)' : 'var(--warn)'} 
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}


"use client";

import { 
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, 
  CartesianGrid, Tooltip, ResponsiveContainer as RC 
} from 'recharts';

interface ChartData {
  label: string;
  value: number;
}

interface DailyUploadsChartProps {
  data: ChartData[];
}

export function DailyUploadsChart({ data }: DailyUploadsChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted uppercase text-[10px] font-black tracking-widest border border-dashed border-default rounded-3xl">
        Waiting for data cycles...
      </div>
    );
  }

  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--pri)" stopOpacity={0.3}/>
              <stop offset="95%" stopColor="var(--pri)" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
          <XAxis 
            dataKey="label" 
            axisLine={false} 
            tickLine={false} 
            tick={{ fontSize: 10, fontWeight: 900, fill: 'var(--muted)', letterSpacing: '0.1em' }}
            dy={10}
          />
          <YAxis 
            axisLine={false} 
            tickLine={false} 
            tick={{ fontSize: 10, fontWeight: 900, fill: 'var(--muted)' }}
          />
          <Tooltip 
            contentStyle={{ 
              backgroundColor: 'rgba(23, 23, 23, 0.8)', 
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '16px',
              boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
              fontSize: '11px',
              fontWeight: 900,
              textTransform: 'uppercase',
              letterSpacing: '0.1em'
            }}
            itemStyle={{ color: 'var(--pri)' }}
          />
          <Area 
            type="monotone" 
            dataKey="value" 
            stroke="var(--pri)" 
            strokeWidth={3}
            fillOpacity={1} 
            fill="url(#colorValue)" 
            animationDuration={2000}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

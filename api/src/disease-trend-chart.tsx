'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from '@/components/ui/chart';
import { LineChart, Line, CartesianGrid, XAxis, YAxis } from 'recharts';

const chartData = Array.from({ length: 15 }, (_, i) => ({
  day: `-${14 - i}d`,
  dengue: 50 + Math.floor(Math.random() * 50) + i * 2,
  malaria: 30 + Math.floor(Math.random() * 40) - i,
  typhoid: 20 + Math.floor(Math.random() * 20) + i * 0.5,
  flu: 60 + Math.floor(Math.random() * 30) - i * 1.5,
}));

const chartConfig = {
  dengue: {
    label: 'Dengue',
    color: 'hsl(var(--chart-1))',
  },
  malaria: {
    label: 'Malaria',
    color: 'hsl(var(--chart-2))',
  },
  typhoid: {
    label: 'Typhoid',
    color: 'hsl(var(--chart-3))',
  },
  flu: {
    label: 'Flu',
    color: 'hsl(var(--chart-4))',
  },
};

export default function DiseaseTrendChart() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Local Disease Trends</CardTitle>
        <CardDescription>
          Case trends for major diseases in your area over the last 15 days.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[300px] w-full">
          <LineChart
            accessibilityLayer
            data={chartData}
            margin={{
              left: 12,
              right: 12,
            }}
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="day"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={(value) => value}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={(value) => `${value}`}
            />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent indicator="dot" />}
            />
            <ChartLegend content={<ChartLegendContent />} />
            <Line
              dataKey="dengue"
              type="monotone"
              stroke="var(--color-dengue)"
              strokeWidth={2}
              dot={false}
            />
            <Line
              dataKey="malaria"
              type="monotone"
              stroke="var(--color-malaria)"
              strokeWidth={2}
              dot={false}
            />
            <Line
              dataKey="typhoid"
              type="monotone"
              stroke="var(--color-typhoid)"
              strokeWidth={2}
              dot={false}
            />
            <Line
              dataKey="flu"
              type="monotone"
              stroke="var(--color-flu)"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

/**
 * Class Balance Analytics Panel
 * Shows class distribution, imbalance detection, and recommendations
 */

import { motion } from 'framer-motion';
import { Scale, AlertTriangle, Loader2, Tag, CheckCircle, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend,
} from 'recharts';

import type { PanelProps } from '@/types/analytics';
import { useClassBalance } from '@/hooks/useClassBalance';
import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * Custom tooltip for class distribution chart
 */
const ClassTooltip = ({ active, payload }: any) => {
  if (!active || !payload || payload.length === 0) return null;

  const data = payload[0].payload;

  return (
    <div className="bg-white/90 backdrop-blur-md rounded-lg shadow-lg px-4 py-3 border border-emerald-200">
      <p className="font-semibold text-gray-800">{data.tag_name}</p>
      <p className="text-sm text-gray-600">
        {data.annotation_count.toLocaleString()} annotations ({data.percentage.toFixed(1)}%)
      </p>
      <p className="text-xs text-gray-500 mt-1">
        {data.image_count.toLocaleString()} images
      </p>
      <p className={`text-xs mt-1 font-medium ${
        data.status === 'healthy' ? 'text-emerald-600' :
        data.status === 'underrepresented' ? 'text-yellow-600' : 'text-red-600'
      }`}>
        {data.status === 'healthy' ? '✓ Healthy' :
         data.status === 'underrepresented' ? '⚠ Underrepresented' : '❌ Severely Underrepresented'}
      </p>
    </div>
  );
};

/**
 * Get bar color based on class health status
 */
function getStatusColor(status: string): string {
  switch (status) {
    case 'severely_underrepresented':
      return '#EF4444'; // Red
    case 'underrepresented':
      return '#F59E0B'; // Yellow
    case 'healthy':
      return '#10B981'; // Green
    default:
      return '#6B7280'; // Gray
  }
}

/**
 * Class Balance Panel Component
 */
export default function ClassBalancePanel({
  projectId,
  filters,
  onFilterUpdate,
}: PanelProps) {
  const prefersReducedMotion = useReducedMotion();

  // Fetch class balance data
  const { data, isLoading, error } = useClassBalance({
    projectId,
    filters,
    enabled: !!projectId,
  });

  /**
   * Handle click on class bar to filter images
   */
  const handleClassClick = (classData: any) => {
    if (!classData || !classData.tag_id) return;

    onFilterUpdate({
      tag_ids: [classData.tag_id],
    });

    toast.success(`Filtering by class: ${classData.tag_name}`, {
      icon: '🏷️',
      duration: 3000,
    });
  };

  /**
   * Handle CSV export
   */
  const handleExport = () => {
    if (!data) return;

    const csv = [
      ['Class Name', 'Annotation Count', 'Image Count', 'Percentage', 'Status'].join(','),
      ...data.class_distribution.map(c =>
        [c.tag_name, c.annotation_count, c.image_count, c.percentage.toFixed(2), c.status].join(',')
      ),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `class-balance-${projectId}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast.success('Class distribution exported!', {
      icon: '💾',
      duration: 2000,
    });
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-500">
        <AlertTriangle className="w-16 h-16 text-red-400 mb-4" />
        <p className="text-lg font-medium">Failed to load class balance</p>
        <p className="text-sm">{(error as Error).message}</p>
      </div>
    );
  }

  // Empty state
  if (!data || data.class_distribution.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-500">
        <Tag className="w-16 h-16 text-gray-300 mb-4" />
        <p className="text-lg font-medium">No classes found</p>
        <p className="text-sm">Add tags to your dataset to see class balance</p>
      </div>
    );
  }

  const { imbalance_score, imbalance_level, class_distribution, recommendations } = data;

  // Prepare chart data (show top 20 classes)
  const chartData = class_distribution.slice(0, 20);

  return (
    <div className="space-y-6 p-6">
      {/* Header with Export Button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Scale className="w-6 h-6 text-emerald-600" />
          <h2 className="text-xl font-bold text-gray-800">Class Balance Analysis</h2>
        </div>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg transition-colors"
        >
          <Download className="w-4 h-4" />
          <span className="text-sm font-medium">Export CSV</span>
        </button>
      </div>

      {/* Imbalance Score Card */}
      <motion.div
        initial={prefersReducedMotion ? {} : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: prefersReducedMotion ? 0 : 0.3 }}
        className={`rounded-xl p-6 border-l-4 ${
          imbalance_level === 'balanced'
            ? 'bg-emerald-50 border-emerald-500'
            : imbalance_level === 'moderate'
            ? 'bg-yellow-50 border-yellow-500'
            : 'bg-red-50 border-red-500'
        }`}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-600 mb-1">Imbalance Score (Gini Coefficient)</p>
            <p className={`text-4xl font-bold ${
              imbalance_level === 'balanced' ? 'text-emerald-700' :
              imbalance_level === 'moderate' ? 'text-yellow-700' : 'text-red-700'
            }`}>
              {imbalance_score.toFixed(3)}
            </p>
            <p className={`text-sm mt-2 ${
              imbalance_level === 'balanced' ? 'text-emerald-600' :
              imbalance_level === 'moderate' ? 'text-yellow-600' : 'text-red-600'
            }`}>
              {imbalance_level === 'balanced' && '✅ Balanced distribution'}
              {imbalance_level === 'moderate' && '⚠️ Moderate imbalance'}
              {imbalance_level === 'severe' && '❌ Severe imbalance'}
            </p>
          </div>
          <div className={`w-20 h-20 rounded-full flex items-center justify-center ${
            imbalance_level === 'balanced' ? 'bg-emerald-500' :
            imbalance_level === 'moderate' ? 'bg-yellow-500' : 'bg-red-500'
          }`}>
            {imbalance_level === 'balanced' ? (
              <CheckCircle className="w-10 h-10 text-white" />
            ) : (
              <AlertTriangle className="w-10 h-10 text-white" />
            )}
          </div>
        </div>

        {/* Explanation */}
        <div className="mt-4 pt-4 border-t border-gray-200">
          <p className="text-xs text-gray-600">
            <strong>Gini Coefficient:</strong> 0 = perfect balance, 1 = maximum imbalance.
            Lower is better for model training.
          </p>
        </div>
      </motion.div>

      {/* Class Distribution Bar Chart */}
      <motion.div
        initial={prefersReducedMotion ? {} : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: prefersReducedMotion ? 0 : 0.3, delay: 0.1 }}
        className="bg-white rounded-xl shadow-sm p-6 border border-gray-200"
        style={{ minHeight: 500 }}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">Class Distribution</h3>
            <p className="text-sm text-gray-600 mt-1">
              {class_distribution.length} classes total. Showing top 20. Click bars to filter.
            </p>
          </div>
        </div>

        <ResponsiveContainer width="100%" height={400}>
          <BarChart
            data={chartData}
            margin={{ top: 20, right: 30, left: 20, bottom: 100 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="tag_name"
              angle={-45}
              textAnchor="end"
              height={100}
              tick={{ fill: '#6b7280', fontSize: 12 }}
              tickLine={{ stroke: '#9ca3af' }}
            />
            <YAxis
              tick={{ fill: '#6b7280' }}
              tickLine={{ stroke: '#9ca3af' }}
              label={{ value: 'Annotation Count', angle: -90, position: 'insideLeft', fill: '#6b7280' }}
            />
            <Tooltip content={<ClassTooltip />} />
            <Bar
              dataKey="annotation_count"
              onClick={handleClassClick}
              radius={[8, 8, 0, 0]}
              cursor="pointer"
              animationDuration={prefersReducedMotion ? 0 : 800}
              style={{ outline: 'none' }}
            >
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={getStatusColor(entry.status)}
                  className="hover:opacity-80 transition-opacity"
                  style={{ outline: 'none' }}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>

        {/* Legend */}
        <div className="flex items-center justify-center gap-6 mt-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-emerald-500" />
            <span className="text-gray-600">Healthy (≥15%)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-yellow-500" />
            <span className="text-gray-600">Underrepresented (5-15%)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-red-500" />
            <span className="text-gray-600">Severely Underrepresented (&lt;5%)</span>
          </div>
        </div>
      </motion.div>

      {/* Recommendations */}
      <motion.div
        initial={prefersReducedMotion ? {} : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: prefersReducedMotion ? 0 : 0.3, delay: 0.2 }}
        className="bg-white rounded-xl shadow-sm p-6 border border-gray-200"
      >
        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-emerald-600" />
          Recommendations
        </h3>
        <ul className="space-y-3">
          {recommendations.map((rec, index) => (
            <motion.li
              key={index}
              initial={prefersReducedMotion ? {} : { opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{
                duration: prefersReducedMotion ? 0 : 0.3,
                delay: prefersReducedMotion ? 0 : 0.3 + index * 0.1,
              }}
              className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg"
            >
              <span className="text-lg">{rec.startsWith('✅') ? '✅' : rec.startsWith('⚠️') ? '⚠️' : '📊'}</span>
              <p className="text-sm text-gray-700 flex-1">{rec}</p>
            </motion.li>
          ))}
        </ul>
      </motion.div>

      {/* Summary Statistics */}
      <motion.div
        initial={prefersReducedMotion ? {} : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: prefersReducedMotion ? 0 : 0.3, delay: 0.3 }}
        className="grid grid-cols-1 md:grid-cols-3 gap-4"
      >
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 border-l-4 border-blue-500">
          <p className="text-sm font-medium text-blue-700">Total Classes</p>
          <p className="text-3xl font-bold text-blue-900 mt-1">
            {class_distribution.length}
          </p>
        </div>

        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-xl p-4 border-l-4 border-emerald-500">
          <p className="text-sm font-medium text-emerald-700">Healthy Classes</p>
          <p className="text-3xl font-bold text-emerald-900 mt-1">
            {class_distribution.filter(c => c.status === 'healthy').length}
          </p>
        </div>

        <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-xl p-4 border-l-4 border-red-500">
          <p className="text-sm font-medium text-red-700">Needs Attention</p>
          <p className="text-3xl font-bold text-red-900 mt-1">
            {class_distribution.filter(c => c.status !== 'healthy').length}
          </p>
        </div>
      </motion.div>
    </div>
  );
}

import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { BaseNode } from './BaseNode';

export const ConditionNode = ({ id, data, selected }: any) => {
  return (
    <BaseNode
      nodeId={id}
      selected={selected}
      defaultError="Property 'plan_type' missing in input object."
      
      width="w-80"
      baseRingClass="ring-2 ring-blue-600/20 shadow-sm hover:ring-blue-600/40"
      headerTitle="Logic Control"
      headerColorClass="bg-blue-100"
      headerTextClass="text-blue-800"
      iconName="call_split"
      iconBgClass="bg-blue-50 text-blue-600"
      title={data?.title || "Check Subscription"}
      description={data?.description || "plan_type == 'enterprise'"}
      
      handles={
        <>
          <Handle type="target" position={Position.Top} className="w-4 h-4 !bg-white border-[3px] !border-blue-600 rounded-full shadow-sm" />
          <Handle type="source" id="true" position={Position.Bottom} style={{ left: '30%' }} className="w-4 h-4 !bg-white border-[3px] !border-blue-600 rounded-full shadow-sm" />
          <Handle type="source" id="false" position={Position.Bottom} style={{ left: '70%' }} className="w-4 h-4 !bg-white border-[3px] !border-stone-400 rounded-full shadow-sm" />
        </>
      }
    >
      <div className="mx-5 mb-5 pt-4 border-t border-stone-100 grid grid-cols-2 gap-2">
        <div className="text-center p-2 rounded-lg bg-stone-50">
          <span className="text-[10px] font-bold text-blue-600 block mb-1">TRUE</span>
        </div>
        <div className="text-center p-2 rounded-lg bg-stone-50">
          <span className="text-[10px] font-bold text-stone-400 block mb-1">FALSE</span>
        </div>
      </div>
    </BaseNode>
  );
};

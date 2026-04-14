import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { BaseNode } from './BaseNode';

export const DelayNode = ({ id, data, selected }: any) => {
  return (
    <BaseNode
      nodeId={id}
      selected={selected}
      defaultError="Timeout constraint exceeded."
      
      width="w-64"
      showHeader={false}
      topBarClass="bg-blue-600"
      iconName="timer"
      iconBgClass="bg-stone-100 text-stone-500"
      title={data?.title !== undefined ? data.title : "Delay Execution"}
      description={data?.description !== undefined ? data.description : "5 Minutes"}
      
      handles={
        <>
          <Handle type="target" position={Position.Top} className="w-4 h-4 !bg-white border-[3px] !border-blue-600 rounded-full shadow-sm" />
          <Handle type="source" position={Position.Bottom} className="w-4 h-4 !bg-white border-[3px] !border-blue-600 rounded-full shadow-sm" />
        </>
      }
    />
  );
};

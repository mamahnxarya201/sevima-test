import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { BaseNode } from './BaseNode';

export const ScriptNode = ({ id, data, selected }: any) => {
  return (
    <BaseNode
      nodeId={id}
      selected={selected}
      defaultError="ReferenceError: payload is not defined"
      
      headerTitle="Compute"
      iconName="terminal"
      iconBgClass="bg-stone-100 text-stone-500"
      title={data?.title || "Post-Process"}
      description={data?.description || "Transforming payload..."}
      hasSpinner={true}
      
      handles={
        <>
          <Handle type="target" position={Position.Top} className="w-4 h-4 !bg-white border-[3px] !border-stone-500 rounded-full shadow-sm" />
          <Handle type="source" position={Position.Bottom} className="w-4 h-4 !bg-white border-[3px] !border-stone-500 rounded-full shadow-sm" />
        </>
      }
    />
  );
};

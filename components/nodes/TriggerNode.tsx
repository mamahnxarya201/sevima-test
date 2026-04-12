import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { BaseNode } from './BaseNode';

export const TriggerNode = ({ id, data, selected }: any) => {
  return (
    <BaseNode
      nodeId={id}
      selected={selected}
      defaultError="Failed to establish webhook listener."
      
      headerTitle="Trigger"
      iconName="webhook"
      iconBgClass="bg-blue-100/50 text-blue-600"
      title={data?.title || "HTTP Webhook"}
      description={data?.description || "Listening on /api/v1/event"}
      
      handles={
        <Handle type="source" position={Position.Bottom} className="w-4 h-4 !bg-white border-[3px] !border-blue-600 rounded-full shadow-sm" />
      }
    />
  );
};

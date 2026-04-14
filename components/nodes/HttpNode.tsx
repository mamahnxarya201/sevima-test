import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { BaseNode } from './BaseNode';

export const HttpNode = ({ id, data, selected }: any) => {
  return (
    <BaseNode
      nodeId={id}
      selected={selected}
      defaultError="Connection timed out."
      
      headerTitle="Action"
      iconName="cloud_sync"
      iconBgClass="bg-slate-100 text-slate-600"
      title={data?.title !== undefined ? data.title : "Fetch User Data"}
      description={data?.description !== undefined ? data.description : "GET request to Auth0"}
      
      handles={
        <>
          <Handle type="target" position={Position.Top} className="w-4 h-4 !bg-white border-[3px] !border-slate-600 rounded-full shadow-sm" />
          <Handle type="source" position={Position.Bottom} className="w-4 h-4 !bg-white border-[3px] !border-slate-600 rounded-full shadow-sm" />
        </>
      }
    />
  );
};

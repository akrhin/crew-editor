import { memo, useState, useEffect, useCallback } from 'react';
import { Handle, Position, NodeProps, useReactFlow } from 'reactflow';
import { Box, Typography, TextField } from '@mui/material';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import { COLORS } from '../../theme';
import { FlowMethodData } from '../../types';

const StartNode = ({ data, id }: NodeProps<FlowMethodData>) => {
  const { setNodes } = useReactFlow();
  const [methodName, setMethodName] = useState(data.method_name || '');

  useEffect(() => {
    setMethodName(data.method_name || '');
  }, [data.method_name]);

  const handleMethodNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newName = e.target.value;
    setMethodName(newName);
    // Sync back to node data via ReactFlow instance
    setNodes(nds =>
      nds.map(n =>
        n.id === id
          ? { ...n, data: { ...n.data, method_name: newName } }
          : n
      )
    );
  }, [id, setNodes]);

  return (
    <Box
      aria-label="Start node - execution start point"
      sx={{
        minWidth: 100,
        borderRadius: '12px',
        overflow: 'hidden',
        border: `1px solid ${COLORS.start.border}50`,
        bgcolor: COLORS.start.bg,
        boxShadow: `0 2px 8px rgba(0,0,0,0.3)`,
        transition: 'all 0.15s ease',
        '&:hover': {
          border: `1px solid ${COLORS.start.border}90`,
          boxShadow: `0 0 16px ${COLORS.start.primary}15`,
        },
        position: 'relative',
      }}
    >
      <Box
        sx={{
          px: 1.5,
          py: 0.6,
          bgcolor: COLORS.start.headerBg,
          borderBottom: `1px solid ${COLORS.start.border}30`,
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
        }}
      >
        <PlayArrowRoundedIcon sx={{ fontSize: 14, color: COLORS.start.primary }} />
        <Typography
          variant="caption"
          sx={{
            color: COLORS.start.primary,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            fontSize: '0.6rem',
          }}
        >
          @start
        </Typography>
      </Box>

      <Box sx={{ px: 1.5, py: 0.75, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        <Typography
          variant="caption"
          sx={{ color: COLORS.text.muted, fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}
        >
          Method Name
        </Typography>
        <TextField
          value={methodName}
          onChange={handleMethodNameChange}
          placeholder="method_name"
          size="small"
          fullWidth
          variant="outlined"
          onClick={(e) => e.stopPropagation()}
          inputProps={{
            'aria-label': 'Start node method name',
            style: { fontSize: '0.75rem', padding: '4px 8px' },
          }}
          sx={{
            '& .MuiOutlinedInput-root': {
              bgcolor: `${COLORS.surface.elevated}40`,
              borderRadius: '6px',
              '& fieldset': { borderColor: `${COLORS.surface.border}50` },
              '&:hover fieldset': { borderColor: COLORS.start.border },
              '&.Mui-focused fieldset': { borderColor: COLORS.start.primary },
            },
          }}
        />
      </Box>

      <Handle
        type="source"
        position={Position.Right}
        id="exec-out"
        style={{
          background: COLORS.text.secondary,
          borderRadius: '50%',
          width: 12,
          height: 12,
          border: `2px solid ${COLORS.surface.elevated}`,
          right: -6,
        }}
      />
    </Box>
  );
};

export default memo(StartNode);

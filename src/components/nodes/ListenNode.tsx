import { memo, useState, useEffect, useCallback } from 'react';
import { Handle, Position, NodeProps, useReactFlow } from 'reactflow';
import { Box, Typography, TextField, Chip, Stack } from '@mui/material';
import HearingIcon from '@mui/icons-material/Hearing';
import { COLORS } from '../../theme';
import { FlowMethodData } from '../../types';

const ListenNode = ({ data, id }: NodeProps<FlowMethodData>) => {
  const { setNodes } = useReactFlow();
  const [methodName, setMethodName] = useState(data.method_name || '');
  const [eventsText, setEventsText] = useState((data.listen_events || []).join(', '));

  useEffect(() => {
    setMethodName(data.method_name || '');
  }, [data.method_name]);

  useEffect(() => {
    setEventsText((data.listen_events || []).join(', '));
  }, [data.listen_events]);

  const handleMethodNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newName = e.target.value;
    setMethodName(newName);
    setNodes(nds =>
      nds.map(n =>
        n.id === id
          ? { ...n, data: { ...n.data, method_name: newName } }
          : n
      )
    );
  }, [id, setNodes]);

  const handleEventsChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newText = e.target.value;
    setEventsText(newText);
    const events = newText.split(',').map(s => s.trim()).filter(Boolean);
    setNodes(nds =>
      nds.map(n =>
        n.id === id
          ? { ...n, data: { ...n.data, listen_events: events } }
          : n
      )
    );
  }, [id, setNodes]);

  const events = data.listen_events || [];

  return (
    <Box
      aria-label="Listen node - event listener"
      sx={{
        minWidth: 200,
        borderRadius: '12px',
        overflow: 'hidden',
        border: `1px solid ${COLORS.listen.border}50`,
        bgcolor: COLORS.listen.bg,
        boxShadow: `0 2px 8px rgba(0,0,0,0.3)`,
        transition: 'all 0.15s ease',
        '&:hover': {
          border: `1px solid ${COLORS.listen.border}90`,
          boxShadow: `0 0 16px ${COLORS.listen.primary}15`,
        },
        position: 'relative',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          px: 1.5,
          py: 0.6,
          bgcolor: COLORS.listen.headerBg,
          borderBottom: `1px solid ${COLORS.listen.border}30`,
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
        }}
      >
        <HearingIcon sx={{ fontSize: 14, color: COLORS.listen.primary }} />
        <Typography
          variant="caption"
          sx={{
            color: COLORS.listen.primary,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            fontSize: '0.6rem',
          }}
        >
          @listen
        </Typography>
      </Box>

      {/* Body */}
      <Box sx={{ px: 1.5, py: 0.75, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
        {/* Method Name */}
        <Box>
          <Typography
            variant="caption"
            sx={{ color: COLORS.text.muted, fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', mb: 0.25, display: 'block' }}
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
              'aria-label': 'Listen node method name',
              style: { fontSize: '0.75rem', padding: '4px 8px' },
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                bgcolor: `${COLORS.surface.elevated}40`,
                borderRadius: '6px',
                '& fieldset': { borderColor: `${COLORS.surface.border}50` },
                '&:hover fieldset': { borderColor: COLORS.listen.border },
                '&.Mui-focused fieldset': { borderColor: COLORS.listen.primary },
              },
            }}
          />
        </Box>

        {/* Events */}
        <Box>
          <Typography
            variant="caption"
            sx={{ color: COLORS.text.muted, fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', mb: 0.25, display: 'block' }}
          >
            Events
          </Typography>
          <TextField
            value={eventsText}
            onChange={handleEventsChange}
            placeholder="event1, event2, ..."
            size="small"
            fullWidth
            variant="outlined"
            onClick={(e) => e.stopPropagation()}
            inputProps={{
              'aria-label': 'Listen node events (comma-separated)',
              style: { fontSize: '0.75rem', padding: '4px 8px' },
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                bgcolor: `${COLORS.surface.elevated}40`,
                borderRadius: '6px',
                '& fieldset': { borderColor: `${COLORS.surface.border}50` },
                '&:hover fieldset': { borderColor: COLORS.listen.border },
                '&.Mui-focused fieldset': { borderColor: COLORS.listen.primary },
              },
            }}
          />
          {events.length > 0 && (
            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
              {events.map((evt, i) => (
                <Chip
                  key={i}
                  label={evt}
                  size="small"
                  sx={{
                    fontSize: '0.6rem',
                    height: 18,
                    bgcolor: `${COLORS.listen.primary}20`,
                    color: COLORS.listen.primary,
                    border: `1px solid ${COLORS.listen.border}40`,
                  }}
                />
              ))}
            </Stack>
          )}
        </Box>
      </Box>

      {/* Handles */}
      <Handle
        type="target"
        position={Position.Left}
        id="listen-in"
        style={{
          background: COLORS.listen.primary,
          borderRadius: '50%',
          width: 12,
          height: 12,
          border: `2px solid ${COLORS.surface.elevated}`,
          left: -6,
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="listen-out"
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

export default memo(ListenNode);

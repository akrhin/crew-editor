import { useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button,
  Typography, TextField, Snackbar, Alert,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import IconButton from '@mui/material/IconButton';
import { COLORS } from '../../theme';
import { importFlowFromPython } from '../../utils/importer';

interface ImportModalProps {
  open: boolean;
  onClose: () => void;
  onImport: (nodes: any[], edges: any[]) => void;
}

const monospaceStyle = {
  fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", Consolas, monospace',
  fontSize: '0.75rem',
  lineHeight: 1.5,
};

export default function ImportModal({ open, onClose, onImport }: ImportModalProps) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleImport = () => {
    setError('');
    const result = importFlowFromPython(code);
    if (!result) {
      setError(
        'Could not parse Python code. Make sure it contains a valid Flow class '
        + '(e.g. `class RouterFlow(Flow[...]):` with @start/@listen/@router methods).'
      );
      return;
    }
    if (result.nodes.length === 0) {
      setError('Parsed successfully but no Flow methods found (@start/@listen/@router).');
      return;
    }
    onImport(result.nodes, result.edges);
    setSuccess(true);
    setCode('');
    onClose();
  };

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Import Flow from Python
          </Typography>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent>
          <Typography variant="body2" sx={{ color: COLORS.text.secondary, mb: 1.5 }}>
            Paste your CrewAI Flow Python code below. The parser will extract
            @start, @listen, @router methods and rebuild the graph.
          </Typography>

          <TextField
            value={code}
            onChange={(e) => { setCode(e.target.value); setError(''); }}
            placeholder={`class RouterFlow(Flow[RouterState]):\n    @start()\n    def receive_query(self):\n        ...`}
            multiline
            rows={16}
            fullWidth
            variant="outlined"
            inputProps={{ style: monospaceStyle }}
            sx={{
              '& .MuiOutlinedInput-root': {
                bgcolor: `${COLORS.surface.bg}`,
                borderRadius: '8px',
              },
            }}
          />

          {error && (
            <Alert severity="error" sx={{ mt: 1.5, borderRadius: '8px' }}>
              {error}
            </Alert>
          )}
        </DialogContent>

        <DialogActions sx={{ px: 2, pb: 2 }}>
          <Button onClick={onClose} sx={{ color: COLORS.text.secondary }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleImport}
            disabled={!code.trim()}
          >
            Import
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={success} autoHideDuration={3000} onClose={() => setSuccess(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity="success" sx={{ borderRadius: '8px' }}>
          Flow imported successfully!
        </Alert>
      </Snackbar>
    </>
  );
}
